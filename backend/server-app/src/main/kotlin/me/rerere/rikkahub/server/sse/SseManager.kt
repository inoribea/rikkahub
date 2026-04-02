package me.rerere.rikkahub.server.sse

import io.ktor.server.sse.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.encodeToString
import me.rerere.ai.util.json
import me.rerere.rikkahub.server.dto.*
import java.util.concurrent.ConcurrentHashMap
import kotlin.uuid.Uuid

object SseManager {
    private val connections = ConcurrentHashMap<Uuid, MutableList<ServerSSESession>>()
    private val _events = MutableSharedFlow<SseEvent>(extraBufferCapacity = 64)
    val events = _events.asSharedFlow()

    private var snapshotSeq = 0L

    fun connect(conversationId: Uuid, session: ServerSSESession) {
        connections.computeIfAbsent(conversationId) { mutableListOf() }.add(session)
    }

    fun disconnect(conversationId: Uuid, session: ServerSSESession) {
        connections[conversationId]?.remove(session)
    }

    suspend fun sendSnapshot(conversationId: Uuid, dto: ConversationDto) {
        val event = ConversationSnapshotEvent(
            seq = snapshotSeq++,
            conversation = dto
        )
        broadcast(conversationId, event)
    }

    suspend fun sendNodeUpdate(
        conversationId: Uuid,
        nodeId: Uuid,
        nodeIndex: Int,
        node: MessageNodeDto,
        isGenerating: Boolean
    ) {
        val event = ConversationNodeUpdateEvent(
            seq = snapshotSeq++,
            conversationId = conversationId.toString(),
            nodeId = nodeId.toString(),
            nodeIndex = nodeIndex,
            node = node,
            updateAt = System.currentTimeMillis(),
            isGenerating = isGenerating
        )
        broadcast(conversationId, event)
    }

    suspend fun sendDone(conversationId: Uuid) {
        val event = GenerationDoneEvent(conversationId = conversationId.toString())
        broadcast(conversationId, event)
    }

    suspend fun sendError(conversationId: Uuid, message: String) {
        val event = ErrorEvent(message = message)
        broadcast(conversationId, event)
    }

    suspend fun sendListInvalidate(assistantId: Uuid) {
        val event = ConversationListInvalidateEvent(
            assistantId = assistantId.toString(),
            timestamp = System.currentTimeMillis()
        )
        broadcastAll(event)
    }

    private suspend fun broadcast(conversationId: Uuid, event: Any) {
        val jsonStr = json.encodeToString(event)
        connections[conversationId]?.forEach { session ->
            session.send(jsonStr)
        }
        _events.emit(SseEvent(conversationId, event))
    }

    private suspend fun broadcastAll(event: Any) {
        val jsonStr = json.encodeToString(event)
        connections.values.flatten().forEach { session ->
            session.send(jsonStr)
        }
    }
}

data class SseEvent(
    val conversationId: Uuid,
    val payload: Any
)