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

            //$this->logger->info('CLEAROUT: Processing stock check for store ID: ' . $storeId . ', attribute ID: ' . $attributeId);

            // Get the attribute code from attribute ID
            $attributeCode = $this->getAttributeCodeById($attributeId);
            if (!$attributeCode) {
                return $result->setData([
                    'success' => false,
                    'message' => 'Could not find attribute with ID: ' . $attributeId
                ]);
            }

            //$this->logger->info('CLEAROUT: Found attribute code: ' . $attributeCode);

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
                    $availableStores = $this->getAvailableStores($product, $requestedQty);

                    $stockResults[] = [
                        'sku' => $product->getSku(),
                        'name' => $product->getName(),
                        'requestedQty' => $requestedQty,
                        'availableQty' => $availableQty,
                        'inStock' => $availableQty > 0,
                        'hasEnoughStock' => $hasEnoughStock,
                        'product_url' => $product->getProductUrl(),
                        'availableStores' => $availableStores
                    ];

                    //$this->logger->info('CLEAROUT: Stock check for ' . $product->getSku() . ': requested=' . $requestedQty . ', available=' . $availableQty . ', hasEnough=' . ($hasEnoughStock ? 'yes' : 'no'));

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

    /**
     * Get stores that have sufficient stock for the product
     */
    private function getAvailableStores($product, $requestedQty)
    {
        $availableStores = [];
        
        // Store ID to name mapping (reverse of the JS mapping)
        $storeNames = [
            '20' => 'Springfield',
            '21' => 'Bloemfontein', 
            '22' => 'Chatsworth',
            '23' => 'East London',
            '24' => 'Little Falls',
            '25' => 'Margate',
            '26' => 'Gqeberha',
            '27' => 'Pietermaritzburg',
            '28' => 'Pinetown',
            '29' => 'Pretoria',
            '30' => 'Meadowdale',
            '31' => 'Mt Edgecombe',
            '32' => 'Centurion',
            '33' => 'Welkom',
            '36' => 'George',
            '37' => 'Xavier',
            '38' => 'Fourways',
            '39' => 'Boksburg',
            '40' => 'Montana',
            '41' => 'Sandton',
            '42' => 'Tokai',
            '43' => 'Newmarket',
            '44' => 'Nelspruit',
            '45' => 'Newcastle',
            '46' => 'Randburg',
            '47' => 'N1 City',
            '48' => 'Greenstone',
            '49' => 'Kimberley',
            '50' => 'Montague',
            '51' => 'Hillcrest',
            '52' => 'Umhlanga',
            '53' => 'Nasrec',
            '54' => 'Silver Lakes',
            '55' => 'Richards Bay',
            '56' => 'Willowbridge',
            '57' => 'Arbour Crossing',
            '58' => 'Somerset West',
            '59' => 'Wonderpark',
            '60' => 'Kariega',
            '61' => 'Sunningdale',
            '62' => 'Ballito',
            '63' => 'Paarl',
            '64' => 'Ottery',
            '65' => 'Vanderbijlpark',
            '66' => 'Princess Crossing',
            '67' => 'Brackenfell',
            '68' => 'Rustenburg',
            '69' => 'Polokwane',
            '70' => 'Tzaneen',
            '71' => 'Bethlehem'
        ];
        
        // Attribute ID mapping (from your JS file)
        $attributeMapping = [
            '20' => '197', '21' => '198', '22' => '199', '23' => '200', '24' => '201',
            '25' => '202', '26' => '203', '27' => '204', '28' => '205', '29' => '206',
            '30' => '207', '31' => '208', '32' => '209', '33' => '210', '36' => '211',
            '37' => '212', '38' => '213', '39' => '214', '40' => '215', '41' => '216',
            '42' => '217', '43' => '218', '44' => '219', '45' => '220', '46' => '221',
            '47' => '222', '48' => '223', '49' => '224', '50' => '225', '51' => '226',
            '52' => '227', '53' => '228', '54' => '229', '55' => '230', '56' => '231',
            '57' => '232', '58' => '233', '59' => '234', '60' => '235', '61' => '236',
            '62' => '237', '63' => '291', '64' => '296', '65' => '297', '66' => '299',
            '67' => '300', '68' => '302', '69' => '301', '70' => '303', '71' => '304'
        ];
        
        foreach ($attributeMapping as $storeId => $attributeId) {
            try {
                $attributeCode = $this->getAttributeCodeById($attributeId);
                if ($attributeCode) {
                    $stockValue = (int)$product->getData($attributeCode);
                    if ($stockValue >= $requestedQty) {
                        $availableStores[] = $storeNames[$storeId] ?? 'Store ' . $storeId;
                    }
                }
            } catch (\Exception $e) {
                // Skip stores where we can't check stock
                continue;
            }
        }
        
        return $availableStores;
    }
}