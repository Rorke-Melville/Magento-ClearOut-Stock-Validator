define([
    'jquery',
    'Magento_Checkout/js/model/quote',
    'mage/storage',
    'Magento_Checkout/js/model/resource-url-manager',
    'mage/url',
    'Magento_Customer/js/customer-data'
], function ($, quote, storage, urlBuilder, url, customerData) {
    'use strict';

    var clearOutCategoryId = '360';
    var deliveryMethodCode = 'tablerate_bestway';
    var clickCollectMethodCode = 'flatrate_flatrate';

    var storeAttributeIdMapping = {
        '20': '197',    // Springfield
        '21': '198',    // Bloemfontein
        '22': '199',    // Chatsworth
        '23': '200',    // East London
        '24': '201',    // Little Falls
        '25': '202',    // Margate
        '26': '203',    // Gqeberha (PE)
        '27': '204',    // Pietermaritzaburg
        '28': '205',    // Pinetown
        '29': '206',    // Pretoria
        '30': '207',    // Meadowdale
        '31': '208',    // Mt Edgecombe
        '32': '209',    // Centurion
        '33': '210',    // Welkom
        '36': '211',    // George
        '37': '212',    // Xavier
        '38': '213',    // Fourways
        '39': '214',    // Boksburg
        '40': '215',    // Montana
        '41': '216',    // Sandton
        '42': '217',    // Tokai
        '43': '218',    // Newmarket
        '44': '219',    // Nelspruit
        '45': '220',    // Newcastle
        '46': '221',    // Randburg
        '47': '222',    // N1 City
        '48': '223',    // Greenstone
        '49': '224',    // Kimberley
        '50': '225',    // Montague
        '51': '226',    // Hillcrest
        '52': '227',    // Umhlanga
        '53': '228',    // Nasrec
        '54': '229',    // Silver Lakes
        '55': '230',    // Richards Bay
        '56': '231',    // Willowbridge
        '57': '232',    // Arbour Crossing
        '58': '233',    // Somerset West
        '59': '234',    // Wonderpark
        '60': '235',    // Kariega (Uitenhage)
        '61': '236',    // Sunningdale
        '62': '237',    // Ballito
        '63': '291',    // Paarl
        '64': '296',    // Ottery
        '65': '297',    // Vanderbijlpark
        '66': '299',    // Princess Crossing
        '67': '300',    // Brackenfell
        '68': '302',    // Rustenburg
        '69': '301',    // Polokwane
        '70': '303',    // Tzaneen
        '71': '304'     // Bethlehem
    };

    // Get all clear out product IDs and SKUs from quote for reference
    function getAllClearOutProductInfo() {
        var quoteItems = quote.getItems();
        var clearOutProductIds = [];
        var clearOutSkus = [];
        
        quoteItems.forEach(function(quoteItem) {
            if (quoteItem.product && quoteItem.product.category_ids && 
                quoteItem.product.category_ids.indexOf(clearOutCategoryId) !== -1) {
                clearOutProductIds.push(quoteItem.product.entity_id || quoteItem.item_id || quoteItem.product_id);
                clearOutSkus.push(quoteItem.sku);
            }
        });
        
        return {
            productIds: clearOutProductIds,
            skus: clearOutSkus
        };
    }

    // Method 1: Try to get fresh cart data from customer-data section
    function getCurrentCartItemsFromCustomerData() {
        var cartData = customerData.get('cart');
        var clearOutItems = [];
        
        if (cartData && cartData() && cartData().items) {
            var items = cartData().items;
            //console.log('Cart items from customer data:', items);
            
            // Get the clear out product info from quote for comparison
            var clearOutInfo = getAllClearOutProductInfo();
            
            //console.log('Clear out product IDs from quote:', clearOutInfo.productIds);
            //console.log('Clear out SKUs from quote:', clearOutInfo.skus);
            
            items.forEach(function(item) {
                var currentQty = parseFloat(item.qty) || 0;
                var itemProductId = item.product_id || item.item_id;
                var itemSku = item.product_sku || item.sku;
                
                // Check if this item is a clear out product by matching ID or SKU
                var isClearOut = clearOutInfo.productIds.indexOf(itemProductId) !== -1 || 
                               clearOutInfo.skus.indexOf(itemSku) !== -1;
                
                if (currentQty > 0 && isClearOut) {
                    clearOutItems.push({
                        name: item.name || item.product_name,
                        sku: itemSku,
                        qty: currentQty,
                        product_id: itemProductId
                    });
                    //console.log('Clear out item found in customer data:', item.name || item.product_name, 'Qty:', currentQty);
                }
            });
        }
        
        //console.log('Clear out items from customer data:', clearOutItems);
        return clearOutItems;
    }

    // Method 2: Parse cart quantities directly from DOM (if using standard checkout)
    function getCurrentCartItemsFromDOM() {
        var clearOutItems = [];
        
        // Try to find cart items in the DOM - adjust selectors based on your checkout theme
        $('.cart-item, .item-info, [data-role="cart-item"]').each(function() {
            var $item = $(this);
            
            // Look for quantity input
            var $qtyInput = $item.find('input[name*="qty"], .qty input, input.qty, [data-role="cart-item-qty"]');
            var qty = 0;
            
            if ($qtyInput.length > 0) {
                qty = parseFloat($qtyInput.val()) || 0;
            }
            
            if (qty > 0) {
                // Try to extract product info
                var name = $item.find('.product-item-name, .product-name, [data-bind*="name"]').text().trim() ||
                          $item.find('a').first().text().trim() ||
                          $item.attr('data-product-name') || '';
                          
                var sku = $item.find('.product-sku, .sku, [data-bind*="sku"]').text().trim() ||
                         $item.attr('data-product-sku') || '';
                         
                var productId = $item.attr('data-product-id') || 
                               $item.find('[data-product-id]').attr('data-product-id') || '';
                
                // Check if this might be a clear out product using the reference data
                var clearOutInfo = getAllClearOutProductInfo();
                var isClearOut = clearOutInfo.productIds.indexOf(productId) !== -1 ||
                               clearOutInfo.skus.indexOf(sku) !== -1;
                
                if (isClearOut && name && sku) {
                    clearOutItems.push({
                        name: name,
                        sku: sku,
                        qty: qty,
                        product_id: productId
                    });
                }
            }
        });
        
        return clearOutItems;
    }

    // Method 3: Make AJAX call to get current cart via API
    function getCurrentCartItemsViaAjax() {
        return new Promise(function(resolve, reject) {
            // Force reload customer data first
            if (typeof customerData !== 'undefined' && customerData.reload) {
                customerData.reload(['cart'], true);
            }
            
            $.ajax({
                url: url.build('rest/V1/carts/mine/items'),
                type: 'GET',
                dataType: 'json',
                showLoader: false,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (window.checkoutConfig?.quoteData?.entity_id || '')
                },
                success: function(response) {
                    //console.log('AJAX cart response:', response);
                    var clearOutItems = [];
                    var clearOutInfo = getAllClearOutProductInfo();
                    
                    if (Array.isArray(response)) {
                        response.forEach(function(item) {
                            var currentQty = parseFloat(item.qty) || 0;
                            var itemProductId = item.product_id || item.item_id;
                            var itemSku = item.sku;
                            
                            // Check if this item is a clear out product
                            var isClearOut = clearOutInfo.productIds.indexOf(itemProductId) !== -1 || 
                                           clearOutInfo.skus.indexOf(itemSku) !== -1;
                            
                            if (currentQty > 0 && isClearOut) {
                                clearOutItems.push({
                                    name: item.name,
                                    sku: itemSku,
                                    qty: currentQty,
                                    product_id: itemProductId
                                });
                            }
                        });
                    }
                    
                    //console.log('Clear out items from AJAX:', clearOutItems);
                    resolve(clearOutItems);
                },
                error: function(xhr, status, error) {
                    //console.log('AJAX cart request failed:', error);
                    resolve([]);
                }
            });
        });
    }

    // Method 4: Force refresh customer data and wait longer
    function getCurrentCartItemsWithForceRefresh() {
        return new Promise(function(resolve) {
            // Force a complete customer data refresh
            if (typeof customerData !== 'undefined') {
                customerData.invalidate(['cart']);
                customerData.reload(['cart'], true);
            }
            
            // Wait longer for the refresh to complete
            setTimeout(function() {
                var clearOutItems = getCurrentCartItemsFromCustomerData();
                //console.log('Clear out items after forced refresh:', clearOutItems);
                resolve(clearOutItems);
            }, 500); // Increased wait time
        });
    }

    function getCurrentCartItems() {
        return new Promise(function(resolve) {
            //console.log('Attempting to get current cart items...');
            
            // Method 1: Customer data - this should have the most current quantities
            var itemsFromCustomerData = getCurrentCartItemsFromCustomerData();
            if (itemsFromCustomerData.length > 0) {
                //console.log('Found clear out items from customer data:', itemsFromCustomerData);
                resolve(itemsFromCustomerData);
                return;
            }
            
            //console.log('No clear out items found in customer data, trying DOM method...');
            
            // Method 2: DOM parsing
            var itemsFromDOM = getCurrentCartItemsFromDOM();
            if (itemsFromDOM.length > 0) {
                //console.log('Found clear out items from DOM:', itemsFromDOM);
                resolve(itemsFromDOM);
                return;
            }
            
            //console.log('No clear out items found in DOM, trying AJAX method...');
            
            // Method 3: AJAX call to get fresh cart data
            getCurrentCartItemsViaAjax().then(function(itemsFromAjax) {
                if (itemsFromAjax.length > 0) {
                    //console.log('Found clear out items from AJAX:', itemsFromAjax);
                    resolve(itemsFromAjax);
                    return;
                }
                
                //console.log('No clear out items found via AJAX, trying forced refresh...');
                
                // Method 4: Force refresh and try customer data again
                getCurrentCartItemsWithForceRefresh().then(function(itemsFromRefresh) {
                    if (itemsFromRefresh.length > 0) {
                        //console.log('Found clear out items after forced refresh:', itemsFromRefresh);
                        resolve(itemsFromRefresh);
                        return;
                    }
                    
                    //console.log('No clear out items found after all methods - cart appears to be clean');
                    resolve([]);
                });
            });
        });
    }

    // Keep the old function name for backwards compatibility
    function hasClearOutProducts() {
        var cartItems = quote.getItems();
        var clearOutItems = [];
        if (cartItems && cartItems.length > 0) {
            cartItems.forEach(function(item) {
                if (item.product && item.product.category_ids && item.product.category_ids.indexOf(clearOutCategoryId) !== -1) {
                    clearOutItems.push({
                        name: item.name,
                        sku: item.sku,
                        qty: item.qty,
                        product_id: item.product.entity_id || item.item_id || item.product_id
                    });
                }
            });
        }
        return clearOutItems;
    }

    function getCurrentShippingMethod() {
        var shippingMethod = quote.shippingMethod();
        return shippingMethod ? shippingMethod.carrier_code + '_' + shippingMethod.method_code : null;
    }

    function getSelectedStore() {
        try {
            var $orderComment = $('#osc_order_comment');
            if ($orderComment.length > 0 && $orderComment.val()) {
                var orderCommentValue = $orderComment.val();
                
                var firstCommaIndex = orderCommentValue.indexOf(',');
                if (firstCommaIndex !== -1) {
                    var storeId = orderCommentValue.substring(0, firstCommaIndex).trim();
                    
                    var collectFromIndex = orderCommentValue.indexOf('Collect from ');
                    var storeName = 'Unknown Store';
                    if (collectFromIndex !== -1) {
                        storeName = orderCommentValue.substring(collectFromIndex + 13).trim();
                    }
                    
                    return {
                        storeId: storeId,
                        storeName: storeName
                    };
                }
            }
        } catch (e) {
            console.log('Error parsing selected store:', e);
        }
        return null;
    }

    function getStoreStockAttributeId(storeId) {
        var attributeId = storeAttributeIdMapping[storeId];
        return attributeId || null;
    }

    function checkStoreStockViaAjax(clearOutItems, storeId) {
        return new Promise(function(resolve, reject) {
            var stockAttributeId = getStoreStockAttributeId(storeId);
            
            if (!stockAttributeId) {
                resolve(clearOutItems.map(function(item) {
                    return {
                        sku: item.sku,
                        name: item.name,
                        requestedQty: item.qty,
                        availableQty: 0,
                        inStock: false,
                        hasEnoughStock: false,
                        error: 'Store configuration not found'
                    };
                }));
                return;
            }

            var requestData = {
                items: clearOutItems.map(function(item) {
                    return {
                        product_id: item.product_id,
                        sku: item.sku,
                        name: item.name,
                        qty: item.qty
                    };
                }),
                store_id: storeId,
                attribute_id: stockAttributeId
            };

            //console.log('Making AJAX request for stock check with current quantities:', requestData);

            $.ajax({
                url: url.build('clearout/stock/check'),
                type: 'POST',
                data: JSON.stringify(requestData),
                contentType: 'application/json',
                dataType: 'json',
                showLoader: false,
                success: function(response) {
                    if (response.success && response.stock_results) {
                        resolve(response.stock_results);
                    } else {
                        console.error('Stock check failed:', response.message);
                        resolve(clearOutItems.map(function(item) {
                            return {
                                sku: item.sku,
                                name: item.name,
                                requestedQty: item.qty,
                                availableQty: 0,
                                inStock: false,
                                hasEnoughStock: true,
                                error: response.message || 'Stock check failed'
                            };
                        }));
                    }
                },
                error: function(xhr, status, error) {
                    console.error('AJAX error during stock check:', error, 'Status:', status);
                    console.error('Response:', xhr.responseText);
                    resolve(clearOutItems.map(function(item) {
                        return {
                            sku: item.sku,
                            name: item.name,
                            requestedQty: item.qty,
                            availableQty: 0,
                            inStock: false,
                            hasEnoughStock: true,
                            error: 'Network error during stock check'
                        };
                    }));
                }
            });
        });
    }

    return {
        validateClearOutProducts: function () {
            return new Promise(function(resolve, reject) {
                // Get current cart items using multiple fallback methods - now always returns a promise
                getCurrentCartItems().then(function(clearOutItems) {
                    //console.log('validateClearOutProducts - current cart items:', clearOutItems);
                    
                    if (clearOutItems.length === 0) {
                        //console.log('No clear out products in cart, allowing checkout');
                        resolve({ allowed: true, message: 'No clear out products' });
                        return;
                    }

                    //console.log('Clear out products found:', clearOutItems.length);
                    var shippingMethod = getCurrentShippingMethod();
                    //console.log('Current shipping method:', shippingMethod);

                    if (shippingMethod === deliveryMethodCode) {
                        //console.log('Delivery method detected with clear out products - BLOCKING');
                        resolve({
                            allowed: false,
                            message: 'Clear out products cannot be delivered. Please select Click & Collect option.',
                            reason: 'delivery_not_allowed',
                            clearOutItems: clearOutItems
                        });
                        return;
                    }

                    if (shippingMethod === clickCollectMethodCode) {
                        var selectedStore = getSelectedStore();
                        if (!selectedStore) {
                            //console.log('Click & Collect selected but no store chosen - BLOCKING');
                            resolve({
                                allowed: false,
                                message: 'Please select a Click & Collect store for your clear out products.',
                                reason: 'no_store_selected',
                                clearOutItems: clearOutItems
                            });
                            return;
                        }

                        console.log('Checking stock for store:', selectedStore.storeName, '(ID:', selectedStore.storeId + ')');
                        console.log('Using current cart quantities:', clearOutItems.map(function(item) { 
                            return item.name + ': ' + item.qty; 
                        }).join(', '));
                        
                        checkStoreStockViaAjax(clearOutItems, selectedStore.storeId)
                            .then(function(stockResults) {
                                if (!Array.isArray(stockResults)) {
                                    console.error('Stock results is not an array:', stockResults);
                                    resolve({ allowed: true, message: 'Invalid stock results format, proceeding with caution' });
                                    return;
                                }

                                var outOfStockItems = stockResults.filter(function(item) {
                                    return !item.hasEnoughStock;
                                });
                                
                                if (outOfStockItems.length > 0) {
                                    var itemNames = outOfStockItems.map(function(item) {
                                        return item.name + ' (need ' + item.requestedQty + ', available ' + item.availableQty + ')';
                                    }).join('\n');
                                    
                                    //console.log('Stock validation failed for items:', outOfStockItems);
                                    resolve({
                                        allowed: false,
                                        message: 'Insufficient stock at ' + selectedStore.storeName + ' for:\n' + itemNames + '\n\nPlease select a different store or reduce quantities.',
                                        reason: 'insufficient_stock',
                                        clearOutItems: clearOutItems,
                                        storeDetails: selectedStore,
                                        stockDetails: outOfStockItems
                                    });
                                } else {
                                    //console.log('All clear out products have sufficient stock at selected store');
                                    resolve({ allowed: true, message: 'Stock validated successfully' });
                                }
                            })
                            .catch(function(error) {
                                //console.log('Stock check failed, allowing checkout to prevent blocking legitimate orders:', error);
                                resolve({ allowed: true, message: 'Stock check failed, proceeding with caution' });
                            });
                        return;
                    }

                    //console.log('Unknown shipping method, allowing checkout:', shippingMethod);
                    resolve({ allowed: true, message: 'Unknown shipping method, proceeding' });
                }).catch(function(error) {
                    console.error('Error getting current cart items:', error);
                    // Fall back to original method as last resort
                    var clearOutItems = hasClearOutProducts();
                    //console.log('Falling back to original quote method, found:', clearOutItems.length, 'items');
                    
                    if (clearOutItems.length === 0) {
                        resolve({ allowed: true, message: 'No clear out products (fallback)' });
                        return;
                    }

                    var shippingMethod = getCurrentShippingMethod();
                    if (shippingMethod === deliveryMethodCode) {
                        resolve({
                            allowed: false,
                            message: 'Clear out products cannot be delivered. Please select Click & Collect option.',
                            reason: 'delivery_not_allowed',
                            clearOutItems: clearOutItems
                        });
                    } else {
                        resolve({ allowed: true, message: 'Using fallback cart detection' });
                    }
                });
            });
        }
    };
});