import express from "express";
import morgan from "morgan";
import { WebSocketServer } from "ws";
import http from "http";
import userApi from "./api/user.api";
import chatApi from "./api/chat.api"
import dbConnection from "./config/dbConnection";
import dotenv from "dotenv";
import { errorHandler } from "./utils/errorHandler";
import { handleConnection } from "./ws/handler";
import cors from "cors";
import { env } from '@xenova/transformers';



// local cache folder
env.cacheDir = './models';

// important: enables correct headers
env.backends.onnx.wasm.numThreads = 1;


dotenv.config();
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.use(morgan("dev"));
app.use(
  cors({
    origin: true, 
    credentials: true,
  })
);

async function connectDB()
{
    try {
        await dbConnection();
        console.log("MongoDB Connected");
    } catch (err) {
        console.error("MongoDB Error:", err);
    }
}

const server = http.createServer(app);
server.setTimeout(3600000);


let emotionModel: any | null = null;



app.use("/api/v1/user", userApi); 
app.use("/api/chat",chatApi) // /api/chat/converstation/ai/chat/getAll


app.get("/", async (req, res) => {
  try {

  

    return res.status(200).json({
      server:"ok"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Model failed" });
  }
});


const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("Client connected");
  handleConnection(ws);
});


app.use(errorHandler);

process.on('uncaughtException', (err) =>
{
    console.error('Uncaught Exception:', err);
    server.close(() =>
    {
        process.exit(1);
    });

});

process.on('unhandledRejection', (err) =>
{
    console.error('Unhandled Rejection:', err);
    server.close(() =>
    {
        process.exit(1);
    });
}

);
server.listen(PORT, async () =>
{
    console.log(`Server running on http://localhost:${PORT}`);
    await connectDB();
});
