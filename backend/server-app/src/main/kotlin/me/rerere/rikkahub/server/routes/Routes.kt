package me.rerere.rikkahub.server.routes

import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.server.sse.*
import kotlinx.coroutines.awaitCancellation
import kotlinx.serialization.encodeToString
import me.rerere.ai.util.json
import me.rerere.ai.ui.UIMessage
import me.rerere.rikkahub.server.db.dao.ConversationDao
import me.rerere.rikkahub.server.db.dao.SettingsDao
import me.rerere.rikkahub.server.db.dao.toDto
import me.rerere.rikkahub.server.db.dao.toListDto
import me.rerere.rikkahub.server.dto.*
import me.rerere.rikkahub.server.model.Conversation
import me.rerere.rikkahub.server.model.MessageNode
import me.rerere.rikkahub.server.sse.SseManager
import kotlin.uuid.Uuid

fun Route.conversationRoutes() {
    route("/conversations") {
        get {
            val assistantId = SettingsDao.get<String?>("currentAssistantId", null)
            val conversations = if (assistantId != null) {
                ConversationDao.findByAssistantId(Uuid.parse(assistantId))
            } else {
                ConversationDao.findAll()
            }
            call.respond(conversations.map { conv -> conv.toListDto() })
        }

        get("/paged") {
            val offset = call.request.queryParameters["offset"]?.toIntOrNull() ?: 0
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 20

            val conversations = ConversationDao.findAll(offset, limit)
            val total = ConversationDao.count()

            call.respond(PagedResult(
                items = conversations.map { conv -> conv.toListDto() },
                nextOffset = if (offset + limit < total) offset + limit else null
            ))
        }

        get("/{id}") {
            val id = Uuid.parse(call.parameters["id"] ?: throw IllegalArgumentException("Invalid id"))
            val conversation = ConversationDao.findById(id)
                ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found", 404))
            call.respond(conversation.toDto())
        }

        delete("/{id}") {
            val id = Uuid.parse(call.parameters["id"] ?: throw IllegalArgumentException("Invalid id"))
            ConversationDao.delete(id)
            call.respond(HttpStatusCode.NoContent)
        }

        post("/{id}/pin") {
            val id = Uuid.parse(call.parameters["id"] ?: throw IllegalArgumentException("Invalid id"))
            val conversation = ConversationDao.findById(id)
                ?: return@post call.respond(HttpStatusCode.NotFound, ErrorResponse("Not found", 404))
            ConversationDao.update(conversation.copy(isPinned = !conversation.isPinned))
            call.respond(HttpStatusCode.OK, mapOf("status" to "updated"))
        }

        post("/{id}/title") {
            val id = Uuid.parse(call.parameters["id"] ?: throw IllegalArgumentException("Invalid id"))
            val request = call.receive<UpdateConversationTitleRequest>()
            ConversationDao.updateTitle(id, request.title)
            call.respond(HttpStatusCode.OK, mapOf("status" to "updated"))
        }

        post("/{id}/messages") {
            val id = Uuid.parse(call.parameters["id"] ?: throw IllegalArgumentException("Invalid id"))
            val request = call.receive<SendMessageRequest>()

            var conversation = ConversationDao.findById(id)
            if (conversation == null) {
                val assistantId = SettingsDao.get<String?>("currentAssistantId", null)
                    ?: Uuid.random().toString()
                conversation = Conversation(
                    id = id,
                    assistantId = Uuid.parse(assistantId),
                    messageNodes = emptyList()
                )
            }

            val userMessage = UIMessage(
                role = me.rerere.ai.core.MessageRole.USER,
                parts = request.parts
            )
            conversation = conversation.updateCurrentMessages(conversation.currentMessages + userMessage)
            ConversationDao.insert(conversation)

            call.respond(HttpStatusCode.Accepted, mapOf("status" to "accepted"))
        }

        post("/{id}/stop") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "stopped"))
        }

        sse("/{id}/stream") {
            val id = call.parameters["id"] ?: return@sse
            val uuid = runCatching { Uuid.parse(id) }.getOrNull() ?: return@sse

            SseManager.connect(uuid, this)

            try {
                val conversation = ConversationDao.findById(uuid)
                if (conversation != null) {
                    val event = ConversationSnapshotEvent(
                        seq = 0,
                        conversation = conversation.toDto()
                    )
                    send(json.encodeToString(event))
                }

                awaitCancellation()
            } finally {
                SseManager.disconnect(uuid, this)
            }
        }
    }
}

fun Route.settingsRoutes() {
    route("/settings") {
        get {
            val settings = mapOf(
                "currentAssistantId" to (SettingsDao.get<String?>("currentAssistantId", null) ?: "")
            )
            call.respond(settings)
        }

        post("/assistant") {
            val request = call.receive<UpdateAssistantRequest>()
            SettingsDao.set("currentAssistantId", request.assistantId)
            call.respond(HttpStatusCode.OK, mapOf("status" to "updated"))
        }
    }
}

fun Route.filesRoutes() {
    route("/files") {
        post {
            call.respond(HttpStatusCode.Created, UploadFilesResponseDto(emptyList()))
        }
    }
}