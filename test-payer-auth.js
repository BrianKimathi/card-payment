'use strict';

/**
 * Test script for Payer Authentication (3D Secure) endpoints
 * 
 * Usage:
 *   node test-payer-auth.js
 * 
 * Make sure the server is running on http://localhost:4000
 */

const BASE_URL = process.env.CYBERSOURCE_HELPER_URL || 'http://localhost:4000';

const testCard3DS = {
  number: '4000000000003220', // Visa card that triggers 3D Secure
  expirationMonth: '12',
  expirationYear: '2031',
  type: '001', // Visa
};

const testCardNo3DS = {
  number: '4111111111111111', // Visa card without 3D Secure
  expirationMonth: '12',
  expirationYear: '2031',
  type: '001',
};

const billingInfo = {
  firstName: 'John',
  lastName: 'Doe',
  address1: '1 Market St',
  locality: 'Nairobi',
  administrativeArea: 'Nairobi',
  postalCode: '00100',
  country: 'KE',
  email: 'test@example.com',
  phoneNumber: '254712345678',
};

async function makeRequest(method, endpoint, data) {
  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const responseData = await response.json();
    return {
      status: response.status,
      ok: response.ok,
      data: responseData,
    };
  } catch (error) {
    return {
      status: 500,
      ok: false,
      error: error.message,
    };
  }
}

async function testHealthCheck() {
  console.log('\n🔍 Testing Health Check...');
  const result = await makeRequest('GET', '/health');
  if (result.ok) {
    console.log('✅ Health check passed:', result.data);
    return true;
  } else {
    console.log('❌ Health check failed:', result.error || result.data);
    return false;
  }
}

async function testEnrollment(card, testName) {
  console.log(`\n🔍 Testing Enrollment Check (${testName})...`);
  const payload = {
    amount: 100.0,
    currency: 'KES',
    card,
    billingInfo,
    referenceCode: `TEST_ENROLL_${Date.now()}`,
  };

  const result = await makeRequest('POST', '/api/payer-auth/enroll', payload);

  if (result.ok) {
    console.log('✅ Enrollment check successful:');
    console.log(JSON.stringify(result.data, null, 2));
    return result.data;
  } else {
    console.log('❌ Enrollment check failed:');
    console.log(JSON.stringify(result.data || result.error, null, 2));
    return null;
  }
}

async function testValidation(enrollmentData) {
  if (!enrollmentData || enrollmentData.enrolled !== 'Y') {
    console.log('\n⚠️ Skipping validation - card not enrolled');
    return null;
  }

  console.log('\n🔍 Testing Validation...');
  const payload = {
    authenticationTransactionId: enrollmentData.authenticationTransactionId,
    amount: 100.0,
    currency: 'KES',
    card: testCard3DS,
    billingInfo,
    referenceCode: `TEST_VALIDATE_${Date.now()}`,
  };

  const result = await makeRequest('POST', '/api/payer-auth/validate', payload);

  if (result.ok) {
    console.log('✅ Validation successful:');
    console.log(JSON.stringify(result.data, null, 2));
    return result.data;
  } else {
    console.log('❌ Validation failed:');
    console.log(JSON.stringify(result.data || result.error, null, 2));
    return null;
  }
}

async function testPaymentWithAuth(enrollmentData, validationData) {
  console.log('\n🔍 Testing Payment with Authentication...');
  const payload = {
    amount: 100.0,
    currency: 'KES',
    card: {
      ...testCard3DS,
      securityCode: '123',
    },
    billingInfo,
    authenticationTransactionId: enrollmentData?.authenticationTransactionId,
    authenticationResult: validationData?.authenticationResult || 'Y',
    referenceCode: `TEST_PAY_AUTH_${Date.now()}`,
    capture: true,
  };

  const result = await makeRequest('POST', '/api/cards/pay', payload);

  if (result.ok) {
    console.log('✅ Payment with authentication successful:');
    console.log(JSON.stringify(result.data, null, 2));
    return result.data;
  } else {
    console.log('❌ Payment with authentication failed:');
    console.log(JSON.stringify(result.data || result.error, null, 2));
    return null;
  }
}

async function testStandardPayment() {
  console.log('\n🔍 Testing Standard Payment (No 3D Secure)...');
  const payload = {
    amount: 100.0,
    currency: 'KES',
    card: {
      ...testCardNo3DS,
      securityCode: '123',
    },
    billingInfo,
    referenceCode: `TEST_PAY_STANDARD_${Date.now()}`,
    capture: true,
  };

  const result = await makeRequest('POST', '/api/cards/pay', payload);

  if (result.ok) {
    console.log('✅ Standard payment successful:');
    console.log(JSON.stringify(result.data, null, 2));
    return result.data;
  } else {
    console.log('❌ Standard payment failed:');
    console.log(JSON.stringify(result.data || result.error, null, 2));
    return null;
  }
}

async function runTests() {
  console.log('🚀 Starting Payer Authentication Tests');
  console.log(`📍 Base URL: ${BASE_URL}`);

  // Health check
  const healthOk = await testHealthCheck();
  if (!healthOk) {
    console.log('\n❌ Health check failed. Is the server running?');
    console.log('   Start the server with: npm run dev');
    process.exit(1);
  }

  // Test 1: Enrollment check with 3D Secure card
  const enrollment3DS = await testEnrollment(testCard3DS, '3D Secure Card');
  
  if (enrollment3DS && enrollment3DS.enrolled === 'Y') {
    console.log(`\n📋 Step Up URL: ${enrollment3DS.stepUpUrl}`);
    console.log('   (In a real app, you would redirect the user to this URL)');
  }

  // Test 2: Validation (if enrolled)
  const validation = await testValidation(enrollment3DS);

  // Test 3: Payment with authentication
  if (enrollment3DS && validation) {
    await testPaymentWithAuth(enrollment3DS, validation);
  }

  // Test 4: Enrollment check with non-3D Secure card
  const enrollmentNo3DS = await testEnrollment(testCardNo3DS, 'Standard Card');

  // Test 5: Standard payment (no 3D Secure)
  await testStandardPayment();

  console.log('\n✅ All tests completed!');
  console.log('\n📝 Notes:');
  console.log('   - If enrollment returns "enrolled: Y", 3D Secure is required');
  console.log('   - If enrollment returns "enrolled: N", proceed with standard payment');
  console.log('   - In production, redirect users to stepUpUrl for authentication');
}

// Check if fetch is available (Node.js 18+)
if (typeof fetch === 'undefined') {
  console.error('❌ This script requires Node.js 18+ or install node-fetch');
  console.error('   Install: npm install node-fetch');
  process.exit(1);
}

runTests().catch((error) => {
  console.error('\n❌ Test execution failed:', error);
  process.exit(1);
});

