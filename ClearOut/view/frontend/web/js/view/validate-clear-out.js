define([
    'jquery',
    'Magento_Checkout/js/model/quote',
    'mage/storage',
    'Magento_Checkout/js/model/resource-url-manager',
    'mage/url'
], function ($, quote, storage, urlBuilder, url) {
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
                    console.log('Clear out product found:', item.name, 'SKU:', item.sku, 'Product ID:', item.product.entity_id || item.item_id || item.product_id);
                }
            });
        }
        console.log('hasClearOutProducts returning:', clearOutItems);
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
                console.log('Order comment value:', orderCommentValue);
                
                var firstCommaIndex = orderCommentValue.indexOf(',');
                if (firstCommaIndex !== -1) {
                    var storeId = orderCommentValue.substring(0, firstCommaIndex).trim();
                    
                    var collectFromIndex = orderCommentValue.indexOf('Collect from ');
                    var storeName = 'Unknown Store';
                    if (collectFromIndex !== -1) {
                        storeName = orderCommentValue.substring(collectFromIndex + 13).trim();
                    }
                    
                    console.log('Parsed store ID:', storeId, 'Store name:', storeName);
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
        console.log('Store', storeId, 'mapped to attribute ID:', attributeId);
        return attributeId || null;
    }

    function checkStoreStockViaAjax(clearOutItems, storeId) {
        return new Promise(function(resolve, reject) {
            var stockAttributeId = getStoreStockAttributeId(storeId);
            
            if (!stockAttributeId) {
                console.log('No stock attribute ID found for store:', storeId);
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

            // Create the request payload
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

            console.log('Making AJAX request for stock check:', requestData);

            // Make AJAX request to custom endpoint
            $.ajax({
                url: url.build('clearout/stock/check'),
                type: 'POST',
                data: JSON.stringify(requestData),
                contentType: 'application/json',
                dataType: 'json',
                showLoader: false, // Changed to false to avoid loader errors
                success: function(response) {
                    console.log('Stock check response:', response);
                    if (response.success && response.stock_results) {
                        console.log('Stock results received:', response.stock_results);
                        resolve(response.stock_results);
                    } else {
                        console.error('Stock check failed:', response.message);
                        // Fail gracefully - allow checkout to prevent blocking legitimate orders
                        resolve(clearOutItems.map(function(item) {
                            return {
                                sku: item.sku,
                                name: item.name,
                                requestedQty: item.qty,
                                availableQty: 0,
                                inStock: false,
                                hasEnoughStock: true, // Allow checkout on error
                                error: response.message || 'Stock check failed'
                            };
                        }));
                    }
                },
                error: function(xhr, status, error) {
                    console.error('AJAX error during stock check:', error, 'Status:', status);
                    console.error('Response:', xhr.responseText);
                    // Fail gracefully - allow checkout to prevent blocking legitimate orders
                    resolve(clearOutItems.map(function(item) {
                        return {
                            sku: item.sku,
                            name: item.name,
                            requestedQty: item.qty,
                            availableQty: 0,
                            inStock: false,
                            hasEnoughStock: true, // Allow checkout on error
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
                var clearOutItems = hasClearOutProducts();
                console.log('validateClearOutProducts clearOutItems:', clearOutItems);
                if (clearOutItems.length === 0) {
                    console.log('No clear out products in cart, allowing checkout');
                    resolve({ allowed: true, message: 'No clear out products' });
                    return;
                }

                console.log('Clear out products found:', clearOutItems.length);
                var shippingMethod = getCurrentShippingMethod();
                console.log('Current shipping method:', shippingMethod);

                if (shippingMethod === deliveryMethodCode) {
                    console.log('Delivery method detected with clear out products - BLOCKING');
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
                        console.log('Click & Collect selected but no store chosen - BLOCKING');
                        resolve({
                            allowed: false,
                            message: 'Please select a Click & Collect store for your clear out products.',
                            reason: 'no_store_selected',
                            clearOutItems: clearOutItems
                        });
                        return;
                    }

                    console.log('Checking stock for store:', selectedStore.storeName, '(ID:', selectedStore.storeId + ')');
                    checkStoreStockViaAjax(clearOutItems, selectedStore.storeId)
                        .then(function(stockResults) {
                            // Ensure stockResults is an array
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
                                resolve({
                                    allowed: false,
                                    message: 'Insufficient stock at ' + selectedStore.storeName + ' for:\n' + itemNames + '\n\nPlease select a different store or reduce quantities.',
                                    reason: 'insufficient_stock',
                                    clearOutItems: clearOutItems,
                                    storeDetails: selectedStore,
                                    stockDetails: outOfStockItems
                                });
                            } else {
                                console.log('All clear out products have sufficient stock at selected store');
                                resolve({ allowed: true, message: 'Stock validated successfully' });
                            }
                        })
                        .catch(function(error) {
                            console.log('Stock check failed, allowing checkout to prevent blocking legitimate orders:', error);
                            resolve({ allowed: true, message: 'Stock check failed, proceeding with caution' });
                        });
                    return;
                }

                console.log('Unknown shipping method, allowing checkout:', shippingMethod);
                resolve({ allowed: true, message: 'Unknown shipping method, proceeding' });
            });
        }
    };
});