'use strict';

/**
 * Simple Card Payment Test
 * Tests a basic authorization with capture (sale) transaction
 * 
 * Usage: node test-card-payment.js
 */

var cybersourceRestApi = require('cybersource-rest-client');
var path = require('path');
var filePath = path.resolve('Configuration.js');
var configuration = require(filePath);

function testCardPayment(callback) {
    try {
        console.log('========================================');
        console.log('CyberSource Card Payment Test');
        console.log('========================================\n');
        
        // Load configuration
        var configObject = new configuration();
        var apiClient = new cybersourceRestApi.ApiClient();
        
        // Create payment request
        var requestObj = new cybersourceRestApi.CreatePaymentRequest();
        
        // Client Reference Information (unique transaction ID)
        var clientReferenceInformation = new cybersourceRestApi.Ptsv2paymentsClientReferenceInformation();
        clientReferenceInformation.code = 'TEST_' + Date.now(); // Unique reference
        requestObj.clientReferenceInformation = clientReferenceInformation;
        
        // Processing Information
        var processingInformation = new cybersourceRestApi.Ptsv2paymentsProcessingInformation();
        processingInformation.capture = true; // Authorize and capture immediately (sale)
        requestObj.processingInformation = processingInformation;
        
        // Payment Information - Card Details
        var paymentInformation = new cybersourceRestApi.Ptsv2paymentsPaymentInformation();
        var paymentInformationCard = new cybersourceRestApi.Ptsv2paymentsPaymentInformationCard();
        
        // Test card: 4111111111111111 (Visa test card)
        paymentInformationCard.number = '4111111111111111';
        paymentInformationCard.expirationMonth = '12';
        paymentInformationCard.expirationYear = '2031';
        // Note: CVV is optional in test environment, but can be included if needed
        // paymentInformationCard.securityCode = '123';
        
        paymentInformation.card = paymentInformationCard;
        requestObj.paymentInformation = paymentInformation;
        
        // Order Information
        var orderInformation = new cybersourceRestApi.Ptsv2paymentsOrderInformation();
        
        // Amount Details
        var orderInformationAmountDetails = new cybersourceRestApi.Ptsv2paymentsOrderInformationAmountDetails();
        orderInformationAmountDetails.totalAmount = '10.00'; // Test amount
        orderInformationAmountDetails.currency = 'USD'; // Using USD for sandbox (KES might not be supported in test)
        orderInformation.amountDetails = orderInformationAmountDetails;
        
        // Billing Information
        var orderInformationBillTo = new cybersourceRestApi.Ptsv2paymentsOrderInformationBillTo();
        orderInformationBillTo.firstName = 'John';
        orderInformationBillTo.lastName = 'Doe';
        orderInformationBillTo.address1 = '1 Market St';
        orderInformationBillTo.locality = 'Nairobi';
        orderInformationBillTo.administrativeArea = 'Nairobi';
        orderInformationBillTo.postalCode = '00100';
        orderInformationBillTo.country = 'KE'; // Kenya
        orderInformationBillTo.email = 'test@example.com';
        orderInformationBillTo.phoneNumber = '254712345678';
        orderInformation.billTo = orderInformationBillTo;
        
        requestObj.orderInformation = orderInformation;
        
        console.log('Sending payment request...');
        console.log('Amount: ' + orderInformationAmountDetails.totalAmount + ' ' + orderInformationAmountDetails.currency);
        console.log('Card: ****' + paymentInformationCard.number.slice(-4));
        console.log('Reference: ' + clientReferenceInformation.code);
        console.log('Merchant ID: ' + configObject.merchantID);
        console.log('Environment: ' + configObject.runEnvironment);
        console.log('');
        
        // Create API instance
        var instance = new cybersourceRestApi.PaymentsApi(configObject, apiClient);
        
        // Make API call
        instance.createPayment(requestObj, function (error, data, response) {
            console.log('========================================');
            console.log('Response Received');
            console.log('========================================\n');
            
            if (error) {
                console.log('❌ ERROR:');
                console.log(JSON.stringify(error, null, 2));
                console.log('');
                console.log('Response Status: ' + (response ? response.status : 'N/A'));
                
                // Check if it's a server error (502, 503, 504)
                if (response && response.status >= 500) {
                    console.log('\n⚠️  This appears to be a CyberSource server error.');
                    console.log('Possible causes:');
                    console.log('  - Temporary server issue (try again in a few moments)');
                    console.log('  - Sandbox environment maintenance');
                    console.log('  - Network connectivity issue');
                    console.log('\nThe request format looks correct. Try running again in a few moments.');
                }
                
                if (response && response.body) {
                    console.log('\nResponse Body:');
                    console.log(JSON.stringify(response.body, null, 2));
                }
                
                // Show response text if available
                if (response && response.text) {
                    console.log('\nResponse Text:');
                    console.log(response.text);
                }
            } else if (data) {
                console.log('✅ SUCCESS:');
                console.log(JSON.stringify(data, null, 2));
                console.log('');
                console.log('Response Status: ' + (response ? response.status : 'N/A'));
                
                // Extract key information
                if (data.id) {
                    console.log('\nTransaction ID: ' + data.id);
                }
                if (data.status) {
                    console.log('Status: ' + data.status);
                }
                if (data.reconciliationId) {
                    console.log('Reconciliation ID: ' + data.reconciliationId);
                }
                if (data.processorInformation) {
                    console.log('Response Code: ' + data.processorInformation.responseCode);
                    console.log('Response Message: ' + data.processorInformation.responseMessage);
                }
            } else {
                console.log('⚠️  No data returned');
                console.log('Response Status: ' + (response ? response.status : 'N/A'));
                if (response && response.body) {
                    console.log('Response Body:');
                    console.log(JSON.stringify(response.body, null, 2));
                }
            }
            
            console.log('\n========================================');
            
            if (callback) {
                callback(error, data, response);
            }
        });
    } catch (error) {
        console.log('❌ EXCEPTION:');
        console.log(error);
        console.log(error.stack);
        if (callback) {
            callback(error, null, null);
        }
    }
}

// Run test if executed directly
if (require.main === module) {
    testCardPayment(function (error, data, response) {
        if (error) {
            console.log('\n❌ Test failed');
            process.exit(1);
        } else {
            console.log('\n✅ Test completed successfully');
            process.exit(0);
        }
    });
}

module.exports.testCardPayment = testCardPayment;

