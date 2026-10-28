// server.js
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

// Shopify security validation ke liye raw body zaroori hai
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// ⚙️ Hiding configurations inside environment variables for maximum production security
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const TEMPLATE_NAME = process.env.TEMPLATE_NAME || "abandoned_cart_recovery";
const LANGUAGE_CODE = process.env.LANGUAGE_CODE || "en_US";
const SHOPIFY_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET;

// 1. Webhook Verification Route (Meta validation ke liye zaroori hai)
app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret_token_123";
    
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('✅ Meta Webhook verified successfully!');
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
});

// 2. Shopify Data Receiver Route (With high security check)
app.post('/webhook', async (req, res) => {
    try {
        // Security Layer: Verify if the request is genuinely coming from Shopify
        if (SHOPIFY_SECRET) {
            const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
            const hash = crypto
                .createHmac('sha256', SHOPIFY_SECRET)
                .update(req.rawBody, 'utf8')
                .digest('base64');
            
            if (hash !== hmacHeader) {
                console.error("❌ Security Alert: Fake request blocked (HMAC validation failed).");
                return res.status(401).send('Unauthorized');
            }
        }

        const checkoutData = req.body;

        // Shopify data extraction
        const phone = checkoutData.phone || 
                      (checkoutData.customer && checkoutData.customer.phone) || 
                      (checkoutData.billing_address && checkoutData.billing_address.phone);
                      
        const firstName = checkoutData.customer ? checkoutData.customer.first_name : "Customer";
        const checkoutUrl = checkoutData.abandoned_checkout_url || "";

        if (!phone) {
            console.log("⚠️ Is abandoned checkout mein phone number nahi mila.");
            return res.status(200).send("No phone number found.");
        }

        // Standardizing phone numbers to international numeric layout (Remove +, spaces, hyphens)
        const cleanPhone = phone.replace(/[^0-9]/g, "");
        console.log(`🛒 Abandoned Checkout Found. Target: ${cleanPhone}`);

        // Error prevention: Check if Meta keys are present before dispatching
        if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
            console.error("❌ Error: Missing WHATSAPP_TOKEN or PHONE_NUMBER_ID config on host server.");
            return res.status(500).send("Server misconfigured.");
        }

        // WhatsApp API Request Payload Setup
        const whatsappUrl = `https://facebook.com{PHONE_NUMBER_ID}/messages`;
        
        const payload = {
            messaging_product: "whatsapp",
            to: cleanPhone,
            type: "template",
            template: {
                name: TEMPLATE_NAME,
                language: {
                    code: LANGUAGE_CODE
                },
                components: [
                    {
                        type: "body",
                        parameters: [
                            { type: "text", text: firstName }, // Dynamic Parameter 1 (Name)
                            { type: "text", text: checkoutUrl } // Dynamic Parameter 2 (Cart Link)
                        ]
                    }
                ]
            }
        };

        // Meta Server Request Execution
        await axios.post(whatsappUrl, payload, {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`🚀 Automated Recovery Notification dispatched successfully to ${cleanPhone}`);
        res.status(200).send("Success");

    } catch (error) {
        console.error("❌ Core System Exception:", error.response ? error.response.data : error.message);
        res.status(500).send("Internal Server Error");
    }
});

// Production Port Initialization
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Automation engine operational on port ${PORT}`);
});
      
