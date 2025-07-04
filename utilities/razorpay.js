const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay with your key ID and secret
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Create an order
const createOrder = async (amount, receipt) => {
  try {
    const options = {
      amount: amount * 100, // Razorpay expects amount in paisa (1 INR = 100 paisa)
      currency: 'INR',
      receipt: receipt,
      payment_capture: 1 // Auto-capture
    };
    
    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    throw error;
  }
};

// Create a subscription
const createSubscription = async (options) => {
  try {
    const subscription = await razorpay.subscriptions.create({
      plan_id: process.env.RAZORPAY_SUBSCRIPTION_PLAN_ID,
      customer_notify: 1,
      total_count: 12, // Number of billing cycles (monthly for a year)
      ...options
    });
    return subscription;
  } catch (error) {
    console.error('Error creating Razorpay subscription:', error);
    throw error;
  }
};

// Verify payment signature
const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(orderId + '|' + paymentId)
      .digest('hex');
    
    return generatedSignature === signature;
  } catch (error) {
    console.error('Error verifying payment signature:', error);
    throw error;
  }
};

// Get subscription details
const getSubscription = async (subscriptionId) => {
  try {
    const subscription = await razorpay.subscriptions.fetch(subscriptionId);
    return subscription;
  } catch (error) {
    console.error('Error fetching subscription:', error);
    throw error;
  }
};

// Cancel subscription
const cancelSubscription = async (subscriptionId) => {
  try {
    const subscription = await razorpay.subscriptions.cancel(subscriptionId);
    return subscription;
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    throw error;
  }
};

module.exports = {
  createOrder,
  createSubscription,
  verifyPaymentSignature,
  getSubscription,
  cancelSubscription
};
