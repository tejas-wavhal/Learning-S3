require('dotenv').config();
const express = require('express');
const { S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer'); // npm install multer
const fetch = require('node-fetch-commonjs'); // npm install node-fetch
const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const port = 3000;

// Initialize AWS S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});



// Generate presigned URL for upload
app.get('/upload-url', async (req, res) => {
  const key = `uploads/${Date.now()}_${req.query.fileName}`;
  const command = new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: key,
    // ContentType
  });

  try {
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    res.json({ key, uploadUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error generating upload URL' });
  }
});

app.post('/upload-image', upload.single('image'), async (req, res) => {
  const { file } = req;
  if (!file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  const key = `uploads/${Date.now()}_${file.originalname}`;
  const command = new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: key,
    ContentType: file.mimetype,
  });

  try {
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    // Use the presigned URL to upload the file
    const putResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.mimetype,
      },
      body: file.buffer,
    });

    if (!putResponse.ok) {
      throw new Error('Failed to upload file to S3');
    }

    res.json({ message: 'File uploaded successfully', key });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error uploading file' });
  }
});

app.get('/images', async (req, res) => {
  const command = new ListObjectsV2Command({
    Bucket: process.env.BUCKET_NAME,
    Prefix: 'uploads/',
  });

  try {
    const { Contents } = await s3Client.send(command);
    const images = Contents.map((c) => ({
      key: c.Key,
      url: `https://${process.env.BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${c.Key}`,
    }));
    res.json(images);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error retrieving images' });
  }
});

// Generate a presigned URL for getting a specific image
app.get('/image/:key', async (req, res) => {
  const { key } = req.params;
  const command = new GetObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: key,
    // ContentType
  });

  try {
    const imageUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
    res.json({ imageUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error generating image URL' });
  }
});




app.use(express.json());

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
