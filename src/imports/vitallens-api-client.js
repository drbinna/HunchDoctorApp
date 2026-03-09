vitallens.js is the official JavaScript client for the VitalLens API, a service for estimating physiological vital signs like heart rate, respiratory rate, and heart rate variability (HRV) from facial video.

vitallens.js vitals-scan demo
The library provides:

High-Fidelity Accuracy: A simple interface to the VitalLens API for state-of-the-art estimation (heart rate, respiratory rate, HRV).
Universal Support: Works seamlessly in the Browser and Node.js with support for real-time webcam streams and files.
Web Components: Drop-in UI widgets for instant integration into your web application.
Local Fallbacks: Implementations of classic rPPG algorithms (pos, chrom, g) for local, API-free processing.
Fast Face Detection: Integrated rapid face detection with support for global ROI skipping to maximize performance.
Using a different language or platform? We also have a Python client and iOS SDK.

Installation
CDN (Browser)
To use the library or web components directly in the browser without a build step:


<script type="module" src="https://cdn.jsdelivr.net/npm/vitallens/dist/vitallens.browser.js"></script>
NPM (Node.js & Bundlers)

npm install vitallens
# or
yarn add vitallens
Quickstart
Using Web Components (Browser)
The fastest way to add vitals scanning to your app.


<script type="module" src="https://cdn.jsdelivr.net/npm/vitallens/dist/vitallens.browser.js"></script>

<vitallens-scan api-key="YOUR_API_KEY"></vitallens-scan>
Using the Core API (Node.js or Browser)
For custom logic and data handling.


import { VitalLens } from 'vitallens';

// Initialize
const vl = new VitalLens({
  method: 'vitallens',
  apiKey: 'YOUR_API_KEY'
});

// Process a file
const result = await vl.processVideoFile(myFile);
console.log("Heart Rate:", result.vitals.heart_rate.value);
Documentation
➡ API Reference – Configuration, Methods, and Events.
🧩 Web Components – Guide to using <vitallens-vitals-scan>, <vitallens-widget>, and others.
🧪 Examples – Examples and Usage Recipes.
📊 Understanding Results – JSON structure and confidence scores.
🛡 Security & Proxies – Deploying securely with a backend proxy.
Troubleshooting
Chrome Security: If testing locally (file://), Chrome may block video processing. Use a local server (e.g., npx serve) instead.
Disclaimer
vitallens provides vital sign estimates for general wellness purposes only. It is not intended for medical use. Always consult with your doctor for any health concerns or for medically precise measurement.