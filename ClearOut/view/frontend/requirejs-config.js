var config = {
    map: {
        '*': {
            'clearOutValidation': 'Gelmar_ClearOut/js/view/validate-clear-out'
        }
    },
    deps: [
        'clearOutValidation'
    ],
    config: {
        mixins: {
            'Magento_Checkout/js/action/place-order': {
                'Gelmar_ClearOut/js/place-order-mixin': true
            }
        }
    }
};