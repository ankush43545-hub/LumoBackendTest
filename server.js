import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ CORS for your frontend
app.use(
  cors({
    origin: "https://ankush43545-hub.github.io",
  })
);

app.use(express.json());

// ✅ Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `
You are Lumo, a friendly and intelligent female AI assistant.
Your tone is flexible, warm, slightly playful when appropriate, and supportive.
You speak naturally like a human, not robotic.
Keep replies clear, engaging, and conversational.
`;

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ reply: "Say something 🙂" });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await model.generateContent(message);
    const reply = result.response.text();

    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      reply: "Sorry, I had a small brain freeze 🧠💭",
    });
  }
});

app.get("/", (req, res) => {
  res.send("Lumo AI backend is running 💜");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
