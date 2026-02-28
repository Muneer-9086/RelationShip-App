import
{
    chat_users_controller, chat_human_conversation_controller, chat_rephase_controller, chat_rephase_suggestion_controller,
    relationship_analysis_schema_controller,
    ai_chat_getAll_controller
} from "../controller/chat.controller";
import express from "express";
const router = express.Router();


router.get("/users/getAll", chat_users_controller);
router.get("/conversation/human", chat_human_conversation_controller);
router.get("/converstation/rephrase", chat_rephase_controller);
router.get("/converstation/rephase/suggestion", chat_rephase_suggestion_controller) //converstationId
router.get("/converstation/relationship/analysis", relationship_analysis_schema_controller)
router.post('/converstation/ai/chat/getAll',ai_chat_getAll_controller)

export default router
