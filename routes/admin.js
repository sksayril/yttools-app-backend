const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Video = require('../models/video.model');
const Transaction = require('../models/transaction.model');
const PaymentRequest = require('../models/paymentRequest.model');

// Admin role constant
const ADMIN_ROLE = 'admin';

// Middleware to authenticate admin
const authenticateAdmin = async (req, res, next) => {
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
    
    // Check if user is an admin
    if (user.userType !== ADMIN_ROLE) {
      return res.status(403).json({ message: 'Access denied: Admin privileges required' });
    }
    
    req.admin = user;
    req.adminId = user._id;
    next();
  } catch (error) {
    console.error('Admin authentication error:', error);
    return res.status(401).json({ message: 'Authentication failed' });
  }
};

// Get all users with subscription information
router.get('/subscriptions', authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find(
      { subscriptionStatus: true },
      'FirstName LastName Email subscriptionStatus subscriptionExpiry'
    ).sort({ subscriptionExpiry: 1 });
    
    return res.status(200).json({
      message: 'Subscribed users retrieved',
      subscribedUsers: users,
      count: users.length
    });
  } catch (error) {
    console.error('Error fetching subscribed users:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get all users with wallet information
router.get('/wallets', authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find(
      {},
      'FirstName LastName Email userType coins walletBalance'
    ).sort({ coins: -1 });
    
    return res.status(200).json({
      message: 'User wallet information retrieved',
      users,
      count: users.length
    });
  } catch (error) {
    console.error('Error fetching user wallet information:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get all payment requests
router.get('/payment-requests', authenticateAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'pending'; // default to pending
    
    const requests = await PaymentRequest.find({ status })
      .populate('userId', 'FirstName LastName Email')
      .sort({ createdAt: -1 });
    
    return res.status(200).json({
      message: `${status} payment requests retrieved`,
      paymentRequests: requests,
      count: requests.length
    });
  } catch (error) {
    console.error('Error fetching payment requests:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Process payment request (approve or reject)
router.put('/payment-requests/:requestId', authenticateAdmin, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, note } = req.body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Status must be either approved or rejected' });
    }
    
    const paymentRequest = await PaymentRequest.findById(requestId);
    
    if (!paymentRequest) {
      return res.status(404).json({ message: 'Payment request not found' });
    }
    
    if (paymentRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending requests can be processed' });
    }
    
    // Update payment request
    paymentRequest.status = status;
    paymentRequest.note = note || '';
    paymentRequest.processedAt = new Date();
    await paymentRequest.save();
    
    // If the request was rejected, return the coins to the user
    if (status === 'rejected') {
      await User.findByIdAndUpdate(paymentRequest.userId, {
        $inc: { coins: paymentRequest.coins }
      });
      
      // Create a transaction to record the refund
      const transaction = new Transaction({
        userId: paymentRequest.userId,
        type: 'recharge', // Reusing recharge type for refund
        amount: 0,
        coins: paymentRequest.coins,
        status: 'completed'
      });
      await transaction.save();
    }
    
    return res.status(200).json({
      message: `Payment request ${status}`,
      paymentRequest
    });
  } catch (error) {
    console.error('Error processing payment request:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Get platform statistics
router.get('/statistics', authenticateAdmin, async (req, res) => {
  try {
    // Get total users count
    const totalUsers = await User.countDocuments();
    const totalCreators = await User.countDocuments({ userType: 'creator' });
    const totalNormalUsers = await User.countDocuments({ userType: 'normal' });
    
    // Get subscribers count
    const activeSubscribers = await User.countDocuments({ 
      subscriptionStatus: true,
      subscriptionExpiry: { $gt: new Date() }
    });
    
    // Get videos stats
    const totalVideos = await Video.countDocuments();
    const activeVideos = await Video.countDocuments({ active: true });
    
    // Get financial stats
    const subscriptionRevenue = await Transaction.aggregate([
      { $match: { type: 'subscription', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const rechargeRevenue = await Transaction.aggregate([
      { $match: { type: 'recharge', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    const pendingPayments = await PaymentRequest.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    return res.status(200).json({
      message: 'Platform statistics retrieved',
      statistics: {
        users: {
          total: totalUsers,
          creators: totalCreators,
          normalUsers: totalNormalUsers,
          activeSubscribers
        },
        videos: {
          total: totalVideos,
          active: activeVideos
        },
        financials: {
          subscriptionRevenue: subscriptionRevenue[0]?.total || 0,
          rechargeRevenue: rechargeRevenue[0]?.total || 0,
          pendingPayments: pendingPayments[0]?.total || 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching platform statistics:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Update user type (normal/creator/admin)
router.put('/users/:userId/type', authenticateAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { userType } = req.body;
    
    if (!['normal', 'creator', 'admin'].includes(userType)) {
      return res.status(400).json({ message: 'Invalid user type' });
    }
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Update user type
    user.userType = userType;
    await user.save();
    
    return res.status(200).json({
      message: 'User type updated successfully',
      user: {
        id: user._id,
        FirstName: user.FirstName,
        LastName: user.LastName,
        Email: user.Email,
        userType: user.userType
      }
    });
  } catch (error) {
    console.error('Error updating user type:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
