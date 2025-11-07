import express from "express";
import axios from "axios";
import OAuth from "oauth-1.0a";
import crypto from "crypto";
import cors from "cors"; 
// Load environment variables
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// 🧭 Resolve the parent directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (one level above /api)
dotenv.config({ path: path.join(__dirname, "../.env") });

console.log("✅ Loaded .env from:", path.join(__dirname, "../.env"));
// --- Express setup ---
const app = express();
app.use(cors());
app.use(express.json());

// --- Load NetSuite credentials from env ---
const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID;
const NETSUITE_CONSUMER_KEY = process.env.NETSUITE_CONSUMER_KEY;
const NETSUITE_CONSUMER_SECRET = process.env.NETSUITE_CONSUMER_SECRET;
const NETSUITE_TOKEN_ID = process.env.NETSUITE_TOKEN_ID;
const NETSUITE_TOKEN_SECRET = process.env.NETSUITE_TOKEN_SECRET;

// --- Validate required env vars ---
if (
  !NETSUITE_ACCOUNT_ID ||
  !NETSUITE_CONSUMER_KEY ||
  !NETSUITE_CONSUMER_SECRET ||
  !NETSUITE_TOKEN_ID ||
  !NETSUITE_TOKEN_SECRET
) {
  console.error("❌ Missing required NetSuite environment variables.");
  process.exit(1);
}

// --- REST API base endpoint for Customer record creation ---
const BASE_URL = `https://${NETSUITE_ACCOUNT_ID.toLowerCase().replace("_", "-")}.suitetalk.api.netsuite.com/services/rest/record/v1/customer`;
console.log("✅ Using NetSuite endpoint:", BASE_URL);

// --- OAuth 1.0a setup ---
const oauth = OAuth({
  consumer: { key: NETSUITE_CONSUMER_KEY, secret: NETSUITE_CONSUMER_SECRET },
  signature_method: "HMAC-SHA256",
  hash_function(base_string, key) {
    return crypto.createHmac("sha256", key).update(base_string).digest("base64");
  },
});

// --- Core Prospect Creation Logic ---
async function createProspect(customerData) {
  const prospectData = {
    companyName: customerData.COMPANY_NAME,
    isPerson: true,
    entityId: `${customerData.COMPANY_NAME} - ${customerData.LAST_NAME}`,
    subsidiary: { id: "17" },
    firstName: customerData.FIRST_NAME,
    lastName: customerData.LAST_NAME,
    title: customerData.JOB_TITLE,
    email: customerData.BUSINESS_EMAIL?.[0] || "",
    altEmail: customerData.PERSONAL_EMAILS?.[0] || "",
    mobilePhone: customerData.MOBILE_PHONE?.[0] || "",
    phone: customerData.COMPANY_PHONE || "",
    entityStatus: { id: "8" },
    comments: `
      Source UUID: ${customerData.UUID}
      Relevance Score: ${customerData.RELEVANCE_SCORE} (Completeness: ${customerData.COMPLETENESS_SCORE})
      COMPANY SUMMARY: ${customerData.COMPANY_SUMMARY}
      RELEVANCE DESCRIPTION: ${customerData.RELEVANCE_DESCRIPTION}
    `,
    addressbook: {
      items: [
        {
          defaultShipping: true,
          defaultBilling: true,
          label: "Company HQ",
          addressBookAddress: {
            addressee: customerData.COMPANY_NAME,
            attention: `${customerData.FIRST_NAME} ${customerData.LAST_NAME}`,
            addr1: customerData.COMPANY_ADDRESS,
            city: customerData.COMPANY_CITY,
            state: customerData.COMPANY_STATE,
            zip: customerData.COMPANY_ZIP,
            addrPhone: customerData.COMPANY_PHONE,
            country: { id: "US" },
          },
        },
      ],
    },
  };

  const requestData = { url: BASE_URL, method: "POST" };

  const authHeader = oauth.toHeader(
    oauth.authorize(requestData, {
      key: NETSUITE_TOKEN_ID,
      secret: NETSUITE_TOKEN_SECRET,
    })
  );
  authHeader.Authorization += `, realm="${NETSUITE_ACCOUNT_ID}"`;

  try {
    const response = await axios.post(BASE_URL, prospectData, {
      headers: {
        ...authHeader,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
    });
    console.log("✅ Prospect created successfully!");
    console.log(JSON.stringify(response.data, null, 2));
    return { success: true, data: response.data };
  } catch (error) {
    console.error("❌ Error creating prospect:", error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

// --- Wrapper function for the route ---
async function create_prospect_netsuite(prospectData) {
  console.log("📩 Prospect received:", JSON.stringify(prospectData, null, 2));
  return await createProspect(prospectData);
}

// --- API Endpoint ---
app.get("/", (req, res) => {
  res.send("Hello World 🌍 — Server is running!");
});

app.post("/api/create-prospect", async (req, res) => {
  try {
    const prospect = req.body;

    if (!prospect || typeof prospect !== "object") {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }

    await create_prospect_netsuite(prospect); // run function, but don’t return result

    return res.status(200).json({
      status: "success",
      message: "Record created successfully",
    });
  } catch (err) {
    console.error("❌ Error in /api/create-prospect:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// --- Start server locally ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
