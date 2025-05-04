// Add dotenv for environment variables
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB connection
const username = encodeURIComponent(process.env.MONGO_USERNAME || 'admin');
const password = encodeURIComponent(process.env.MONGO_PASSWORD || 'admin');
const cluster = process.env.MONGO_CLUSTER || 'localhost:27017';
const dbName = process.env.MONGO_DB_NAME || 'sensorDataDB';

// Create MongoDB connection string based on environment
let mongoURI;
if (cluster.includes('localhost')) {
  // Local MongoDB connection
  mongoURI = `mongodb://localhost:27017/${dbName}`;
  console.log('Using local MongoDB connection');
} else {
  // Atlas MongoDB connection
  mongoURI = `mongodb+srv://${username}:${password}@${cluster}/${dbName}?retryWrites=true&w=majority`;
  console.log('Using MongoDB Atlas connection');
}

// Connect to MongoDB
mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB database'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    console.log('Please ensure MongoDB is running or check your .env configuration');
  });

// Define a single schema for cases
const caseSchema = new mongoose.Schema({
  heartRate: { type: Number, required: true },
  temperature: { type: Number, required: true },
  spo2: { type: Number, required: true },
  gps: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  accelerometer: {
    x: { type: mongoose.Schema.Types.Decimal128, required: true },
    y: { type: mongoose.Schema.Types.Decimal128, required: true },
    z: { type: mongoose.Schema.Types.Decimal128, required: true }
  },
  gyroscope: {
    x: { type: mongoose.Schema.Types.Decimal128, required: true },
    y: { type: mongoose.Schema.Types.Decimal128, required: true },
    z: { type: mongoose.Schema.Types.Decimal128, required: true }
  },
  deviceId: { type: String, required: true, index: true },
  status: { type: String, default: 'none' },  // Values: 'none', 'accepted', 'rejected'
  timestamp: { type: Date, default: Date.now }
});

// Create model
const Case = mongoose.model('Case', caseSchema);

// Root endpoint
app.get('/', (req, res) => {
  res.send('Rescue Service API is running');
});

// Endpoint to receive new case data
app.post('/api/cases', async (req, res) => {
  try {
    const { heartRate, temperature, spo2, gps, accelerometer, gyroscope, deviceId } = req.body;
    
    // Validate required fields
    if (!heartRate || !temperature || !spo2 || !gps || !accelerometer || !gyroscope || !deviceId) {
      return res.status(400).json({ 
        error: 'Missing required fields: heartRate, temperature, spo2, gps, accelerometer, gyroscope, deviceId' 
      });
    }
    
    // Find and remove any pending cases with the same device ID
    const result = await Case.deleteMany({ 
      deviceId: deviceId,
      status: 'none'
    });
    
    if (result.deletedCount > 0) {
      console.log(`Removed ${result.deletedCount} existing pending cases for device ${deviceId}`);
    }
    
    // Create new case
    const newCase = new Case({
      heartRate,
      temperature,
      spo2,
      gps,
      accelerometer,
      gyroscope,
      deviceId,
      status: 'none'
    });
    
    await newCase.save();
    console.log(`New case saved for device ${deviceId}`);
    
    res.status(200).json({ 
      message: 'Case data saved successfully',
      caseId: newCase._id,
      removedPreviousCases: result.deletedCount > 0,
      removedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error saving case data:', error);
    res.status(500).json({ error: 'Error saving case data: ' + error.message });
  }
});

// Endpoint to get all cases
app.get('/api/cases', async (req, res) => {
  try {
    const cases = await Case.find().sort({ timestamp: -1 });
    res.status(200).json(cases);
  } catch (error) {
    console.error('Error retrieving cases:', error);
    res.status(500).json({ error: 'Error retrieving cases: ' + error.message });
  }
});

// Endpoint to get pending cases (status = 'none')
app.get('/api/cases/pending', async (req, res) => {
  try {
    const pendingCases = await Case.find({ status: 'none' }).sort({ timestamp: -1 });
    res.status(200).json(pendingCases);
  } catch (error) {
    console.error('Error retrieving pending cases:', error);
    res.status(500).json({ error: 'Error retrieving pending cases: ' + error.message });
  }
});

// Endpoint to get processed cases (status = 'accepted' or 'rejected')
app.get('/api/cases/processed', async (req, res) => {
  try {
    const processedCases = await Case.find({ 
      status: { $in: ['accepted', 'rejected'] } 
    }).sort({ timestamp: -1 });
    res.status(200).json(processedCases);
  } catch (error) {
    console.error('Error retrieving processed cases:', error);
    res.status(500).json({ error: 'Error retrieving processed cases: ' + error.message });
  }
});

// Endpoint to get all cases for a specific device
app.get('/api/cases/device/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const cases = await Case.find({ deviceId }).sort({ timestamp: -1 });
    res.status(200).json(cases);
  } catch (error) {
    console.error('Error retrieving device cases:', error);
    res.status(500).json({ error: 'Error retrieving device cases: ' + error.message });
  }
});

// Endpoint to accept a case
app.post('/api/cases/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    
    const updatedCase = await Case.findByIdAndUpdate(
      id,
      { status: 'accepted' },
      { new: true }
    );
    
    if (!updatedCase) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    res.status(200).json({ 
      message: 'Case accepted successfully',
      case: updatedCase
    });
  } catch (error) {
    console.error('Error accepting case:', error);
    res.status(500).json({ error: 'Error accepting case: ' + error.message });
  }
});

// Endpoint to reject a case
app.post('/api/cases/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    
    const updatedCase = await Case.findByIdAndUpdate(
      id,
      { status: 'rejected' },
      { new: true }
    );
    
    if (!updatedCase) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    res.status(200).json({ 
      message: 'Case rejected successfully',
      case: updatedCase
    });
  } catch (error) {
    console.error('Error rejecting case:', error);
    res.status(500).json({ error: 'Error rejecting case: ' + error.message });
  }
});

// Endpoint to delete a case
app.delete('/api/cases/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const deletedCase = await Case.findByIdAndDelete(id);
    
    if (!deletedCase) {
      return res.status(404).json({ error: 'Case not found' });
    }
    
    res.status(200).json({ 
      message: 'Case deleted successfully',
      caseId: id
    });
  } catch (error) {
    console.error('Error deleting case:', error);
    res.status(500).json({ error: 'Error deleting case: ' + error.message });
  }
});

// Endpoint to get buzzer status (based on existence of pending cases)
app.get('/api/buzzer-status', async (req, res) => {
  try {
    // Check if there are any cases with status 'none'
    const pendingCases = await Case.find({ status: 'none' });
    
    // Return buzzer status based on whether there are pending cases
    res.status(200).json({ 
      buzzerActive: pendingCases.length > 0,
      pendingCasesCount: pendingCases.length,
      cases: pendingCases.map(c => ({
        id: c._id,
        deviceId: c.deviceId,
        timestamp: c.timestamp
      }))
    });
  } catch (error) {
    console.error('Error checking buzzer status:', error);
    res.status(500).json({ error: 'Error checking buzzer status: ' + error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error: ' + err.message });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 