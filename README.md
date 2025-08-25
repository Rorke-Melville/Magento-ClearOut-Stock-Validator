# Gelmar_ClearOut Module
A Magento 2 module that validates clear-out products during checkout, ensuring they can only be ordered via Click & Collect and have sufficient stock at the selected store.

## Features
- Delivery Restriction: Prevents clear-out products from being delivered - forces Click & Collect selection
- Stock Validation: Checks real-time stock levels at selected Click & Collect stores
- Dynamic Popups: Beautiful, responsive error messages with detailed product information
- Store-Specific Stock: Uses custom product attributes to track stock per store location
- Category-Based Detection: Automatically identifies clear-out products by category membership

## Installation
1. Copy the module files to your Magento installation:
```
app/code/Gelmar/ClearOut/
```
2. Enable the module:
```bash
php bin/magento module:enable Gelmar_ClearOut
php bin/magento setup:upgrade
php bin/magento setup:di:compile
php bin/magento cache:flush
```
## Configuration
1. Clear-Out Category ID
Update the category ID in view/frontend/web/js/view/validate-clear-out.js:

```javascript
var clearOutCategoryId = '360'; // Change this to your clear-out category ID
```
2. Shipping Method Codes
Update shipping method codes in validate-clear-out.js:

```javascript
var deliveryMethodCode = 'tablerate_bestway';     // Your delivery method code
var clickCollectMethodCode = 'flatrate_flatrate'; // Your click & collect method code
```
3. Store Attribute ID Mapping
Update the store-to-attribute mapping in validate-clear-out.js:

```javascript
var storeAttributeIdMapping = {
    '20': '197',    // Store ID: Attribute ID
    '21': '198',    // Springfield: Stock Attribute ID
    '22': '199',    // Bloemfontein: Stock Attribute ID
    // Add your store mappings here...
};
```
To find your store IDs and attribute IDs:

- Store IDs: Admin → Stores → All Stores
- Attribute IDs: Admin → Stores → Attributes → Product → [Your Stock Attribute]
4. Order Comment Field
The module expects store selection to be stored in an order comment field with ID osc_order_comment in this format:
```
[Store ID], Collect from [Store Name]
```
Update the field selector in validate-clear-out.js if your field ID is different:

```javascript
var $orderComment = $('#your_field_id'); // Change this selector
```

## File Structure
```
Gelmar/ClearOut/
├── registration.php
├── Controller/Stock/Check.php
├── etc/
│   ├── module.xml
│   └── frontend/
│       └── routes.xml
└── view/frontend/
    ├── requirejs-config.js
    └── web/js/
        ├── place-order-mixin.js
        └── view/
            └── validate-clear-out.js
```

## How It Works
1. Product Detection: Identifies clear-out products by checking if they belong to the configured category
2. Method Validation: Blocks delivery if clear-out products are in cart
3. Store Selection: Validates that a Click & Collect store has been selected
4. Stock Check: Makes AJAX call to clearout/stock/check endpoint to verify stock levels
5. User Feedback: Shows contextual popups with product details and guidance

## Stock Attribute Setup
Your products need custom attributes to track stock per store:

1. Create product attributes for each store (e.g., stock_store_20, stock_store_21)
2. Set attribute type to "Text" or "Number"
3. Make attributes visible and usable in forms
4. Update products with stock quantities for each store
5. Map store IDs to attribute IDs in the configuration above

## API Endpoint
The module creates a custom endpoint at /clearout/stock/check that accepts:

```json
{
    "items": [
        {
            "product_id": "123",
            "sku": "PRODUCT-SKU",
            "name": "Product Name",
            "qty": 2
        }
    ],
    "store_id": "20",
    "attribute_id": "197"
}
```
Returns stock validation results for all requested items.

## Customization
### Popup Styling
Modify popup appearance in place-order-mixin.js within the getPopupConfig() function. The module includes different themes for different error types.

### Validation Logic
Update validation rules in validate-clear-out.js within the validateClearOutProducts() function.

### Error Messages
Customize error messages in the popup configuration objects in place-order-mixin.js.

## Troubleshooting
### Common Issues
1. Module not working: Ensure all files are in place and module is enabled
2. Stock check failing: Verify store/attribute ID mappings are correct
3. Wrong products detected: Check category ID configuration
4. Popup not showing: Verify shipping method codes match your setup
### Debug Mode
Enable console logging by checking browser developer tools. The module logs extensive debug information to help troubleshoot issues.

### Log Files
Check Magento logs for server-side errors:

```bash
tail -f var/log/system.log | grep CLEAROUT
```
## Requirements
- Magento 2.x
- Custom product attributes for store stock tracking
- Click & Collect shipping method configured
- Order comment field for store selection
## Support
For issues or questions:

- Check the browser console for JavaScript errors
- Review Magento logs for server-side issues
- Verify all configuration values match your setup
- Ensure required product attributes exist and contain data

## Changelog
### Version 1.0.0
Initial release
Clear-out product validation
Store-specific stock checking
Dynamic popup notifications
