const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const PaymentRequest = require('../models/paymentRequest.model');
const razorpayUtils = require('../utilities/razorpay');

// Middleware to authenticate user
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    
    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ message: 'Authentication failed' });
  }
};

// Create a subscription order (₹199)
router.post('/create-subscription', authenticateUser, async (req, res) => {
  try {
    // Check if the user already has an active subscription
    if (req.user.subscriptionStatus && req.user.subscriptionExpiry > new Date()) {
      return res.status(400).json({ message: 'You already have an active subscription' });
    }

    // Create a new Razorpay order for the subscription
    const order = await razorpayUtils.createOrder(199, `sub_${req.userId}`);

    return res.status(200).json({
      message: 'Subscription order created',
      orderId: order.id,
      amount: order.amount / 100,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Error creating subscription order:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Verify subscription payment
router.post('/verify-subscription', authenticateUser, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    // Verify the payment signature
    const isValid = razorpayUtils.verifyPaymentSignature(
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature
    );

    if (!isValid) {
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    // Update user's subscription status
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 1); // Set expiry to 1 month from now

    // Update user with subscription details and add 150 coins
    await User.findByIdAndUpdate(req.userId, {
      subscriptionStatus: true,
      subscriptionExpiry: expiryDate,
      $inc: { coins: 150 } // Add 150 coins
    });

    // Create transaction record
    const transaction = new Transaction({
      userId: req.userId,
      type: 'subscription',
      amount: 199,
      coins: 150,
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpaySignature: razorpay_signature,
      status: 'completed'
    });
    await transaction.save();

    return res.status(200).json({
      message: 'Subscription activated successfully',
      coinsAdded: 150,
      expiryDate
    });
  } catch (error) {
    console.error('Error verifying subscription:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Recharge wallet (for all users)
router.post('/recharge-wallet', authenticateUser, async (req, res) => {
  try {
    const { amount } = req.body;
    
    if (!amount || amount < 10) {
      return res.status(400).json({ message: 'Minimum recharge amount is ₹10' });
    }

    // Calculate coins based on amount (1 coin = ₹1)
    const coins = amount;

    // Create a new Razorpay order for the wallet recharge
    const order = await razorpayUtils.createOrder(amount, `recharge_${req.userId}`);

    return res.status(200).json({
      message: 'Recharge order created',
      orderId: order.id,
      amount: order.amount / 100,
      coins,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Error creating recharge order:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Verify wallet recharge
router.post('/verify-recharge', authenticateUser, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, amount } = req.body;

    // Verify the payment signature
    const isValid = razorpayUtils.verifyPaymentSignature(
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature
    );

    if (!isValid) {
      return res.status(400).json({ message: 'Invalid payment signature' });
    }

    const coins = parseInt(amount);
    
    // Get current user data
    const user = await User.findById(req.userId);
    const updateData = {
      $inc: { coins: coins, walletBalance: amount }
    };
    
    // If user is not already a creator, change their type
    if (user.userType !== 'creator') {
      updateData.userType = 'creator';
    }
    
    // Update user's wallet balance and potentially user type
    await User.findByIdAndUpdate(req.userId, updateData);

    // Create transaction record
    const transaction = new Transaction({
      userId: req.userId,
      type: 'recharge',
      amount: amount,
      coins: coins,
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpaySignature: razorpay_signature,
      status: 'completed'
    });
    await transaction.save();

    return res.status(200).json({
      message: 'Wallet recharged successfully',
      coinsAdded: coins,
      becameCreator: user.userType !== 'creator'
    });
  } catch (error) {
    console.error('Error verifying recharge:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Request payment withdrawal
router.post('/request-withdrawal', authenticateUser, async (req, res) => {
  try {
    const { coins, upiId } = req.body;
    
    if (!coins || coins < 100) {
      return res.status(400).json({ message: 'Minimum withdrawal is 100 coins' });
    }
    
    if (!upiId) {
      return res.status(400).json({ message: 'UPI ID is required' });
    }

    // Check if user has sufficient coins
    if (req.user.coins < coins) {
      return res.status(400).json({ message: 'Insufficient coins in your account' });
    }

    // Amount in INR (1 coin = ₹1)
    const amount = coins;

    // Create payment request
    const paymentRequest = new PaymentRequest({
      userId: req.userId,
      upiId,
      coins,
      amount,
      status: 'pending'
    });
    await paymentRequest.save();

    // Deduct coins from user's account
    await User.findByIdAndUpdate(req.userId, {
      $inc: { coins: -coins }
    });

    return res.status(200).json({
      message: 'Withdrawal request submitted successfully',
      requestId: paymentRequest._id
    });
  } catch (error) {
    console.error('Error requesting withdrawal:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get user's payment history
router.get('/transaction-history', authenticateUser, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(50);
    
    return res.status(200).json({
      message: 'Transaction history retrieved',
      transactions
    });
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get user's withdrawal request history
router.get('/withdrawal-history', authenticateUser, async (req, res) => {
  try {
    const withdrawals = await PaymentRequest.find({ userId: req.userId })
      .sort({ createdAt: -1 });
    
    return res.status(200).json({
      message: 'Withdrawal history retrieved',
      withdrawals
    });
  } catch (error) {
    console.error('Error fetching withdrawal history:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
