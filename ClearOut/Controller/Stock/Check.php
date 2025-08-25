<?php

namespace Gelmar\ClearOut\Controller\Stock;

use Magento\Framework\App\Action\Action;
use Magento\Framework\App\Action\Context;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\App\Request\Http;
use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Eav\Api\AttributeRepositoryInterface;
use Magento\Framework\Exception\NoSuchEntityException;
use Psr\Log\LoggerInterface;

class Check extends Action
{
    protected $jsonResultFactory;
    protected $request;
    protected $productRepository;
    protected $attributeRepository;
    protected $logger;

    public function __construct(
        Context $context,
        JsonFactory $jsonResultFactory,
        Http $request,
        ProductRepositoryInterface $productRepository,
        AttributeRepositoryInterface $attributeRepository,
        LoggerInterface $logger
    ) {
        $this->jsonResultFactory = $jsonResultFactory;
        $this->request = $request;
        $this->productRepository = $productRepository;
        $this->attributeRepository = $attributeRepository;
        $this->logger = $logger;
        parent::__construct($context);
    }

    public function execute()
    {
        $result = $this->jsonResultFactory->create();
        
        try {
            // Get the raw POST data
            $requestBody = $this->request->getContent();
            $requestData = json_decode($requestBody, true);

            if (!$requestData) {
                return $result->setData([
                    'success' => false,
                    'message' => 'Invalid request data'
                ]);
            }

            $items = $requestData['items'] ?? [];
            $storeId = $requestData['store_id'] ?? null;
            $attributeId = $requestData['attribute_id'] ?? null;

            if (empty($items) || !$storeId || !$attributeId) {
                return $result->setData([
                    'success' => false,
                    'message' => 'Missing required data: items, store_id, or attribute_id'
                ]);
            }

            $this->logger->info('CLEAROUT: Processing stock check for store ID: ' . $storeId . ', attribute ID: ' . $attributeId);

            // Get the attribute code from attribute ID
            $attributeCode = $this->getAttributeCodeById($attributeId);
            if (!$attributeCode) {
                return $result->setData([
                    'success' => false,
                    'message' => 'Could not find attribute with ID: ' . $attributeId
                ]);
            }

            $this->logger->info('CLEAROUT: Found attribute code: ' . $attributeCode);

            $stockResults = [];

            foreach ($items as $item) {
                try {
                    $productId = $item['product_id'] ?? null;
                    $sku = $item['sku'] ?? null;
                    $requestedQty = (int)($item['qty'] ?? 0);

                    if (!$productId && !$sku) {
                        $stockResults[] = [
                            'sku' => $sku ?: 'unknown',
                            'name' => $item['name'] ?? 'Unknown Product',
                            'requestedQty' => $requestedQty,
                            'availableQty' => 0,
                            'inStock' => false,
                            'hasEnoughStock' => false,
                            'error' => 'Missing product ID and SKU'
                        ];
                        continue;
                    }

                    // Load the product
                    if ($productId) {
                        $product = $this->productRepository->getById($productId);
                    } else {
                        $product = $this->productRepository->get($sku);
                    }

                    // Get the stock value from the attribute
                    $stockValue = $product->getData($attributeCode);
                    
                    if ($stockValue === null) {
                        $stockValue = 0;
                        $this->logger->info('CLEAROUT: No stock value found for product ' . $product->getSku() . ' attribute ' . $attributeCode);
                    }

                    $availableQty = (int)$stockValue;
                    $hasEnoughStock = $availableQty >= $requestedQty;

                    $stockResults[] = [
                        'sku' => $product->getSku(),
                        'name' => $product->getName(),
                        'requestedQty' => $requestedQty,
                        'availableQty' => $availableQty,
                        'inStock' => $availableQty > 0,
                        'hasEnoughStock' => $hasEnoughStock
                    ];

                    $this->logger->info('CLEAROUT: Stock check for ' . $product->getSku() . ': requested=' . $requestedQty . ', available=' . $availableQty . ', hasEnough=' . ($hasEnoughStock ? 'yes' : 'no'));

                } catch (NoSuchEntityException $e) {
                    $this->logger->error('CLEAROUT: Product not found: ' . $e->getMessage());
                    $stockResults[] = [
                        'sku' => $sku ?: 'unknown',
                        'name' => $item['name'] ?? 'Unknown Product',
                        'requestedQty' => $requestedQty,
                        'availableQty' => 0,
                        'inStock' => false,
                        'hasEnoughStock' => false,
                        'error' => 'Product not found: ' . $e->getMessage()
                    ];
                } catch (\Exception $e) {
                    $this->logger->error('CLEAROUT: Error checking stock for item: ' . $e->getMessage());
                    $stockResults[] = [
                        'sku' => $sku ?: 'unknown',
                        'name' => $item['name'] ?? 'Unknown Product',
                        'requestedQty' => $requestedQty,
                        'availableQty' => 0,
                        'inStock' => false,
                        'hasEnoughStock' => false,
                        'error' => 'Error checking stock: ' . $e->getMessage()
                    ];
                }
            }

            return $result->setData([
                'success' => true,
                'message' => 'Stock check completed',
                'stock_results' => $stockResults,
                'debug' => [
                    'store_id' => $storeId,
                    'attribute_id' => $attributeId,
                    'attribute_code' => $attributeCode,
                    'items_processed' => count($stockResults)
                ]
            ]);

        } catch (\Exception $e) {
            $this->logger->error('CLEAROUT: Fatal error in stock check: ' . $e->getMessage());
            return $result->setData([
                'success' => false,
                'message' => 'Error processing stock check: ' . $e->getMessage()
            ]);
        }
    }

    /**
     * Get attribute code by attribute ID
     */
    private function getAttributeCodeById($attributeId)
    {
        try {
            $attribute = $this->attributeRepository->get('catalog_product', $attributeId);
            return $attribute->getAttributeCode();
        } catch (\Exception $e) {
            $this->logger->error('CLEAROUT: Error getting attribute code for ID ' . $attributeId . ': ' . $e->getMessage());
            return null;
        }
    }
}