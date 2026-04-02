package me.rerere.rikkahub.server.db.dao

import me.rerere.ai.util.json
import me.rerere.rikkahub.server.db.tables.Conversations
import me.rerere.rikkahub.server.dto.ConversationDto
import me.rerere.rikkahub.server.dto.MessageNodeDto
import me.rerere.rikkahub.server.dto.MessageDto
import me.rerere.rikkahub.server.dto.ConversationListDto
import me.rerere.rikkahub.server.model.Conversation
import me.rerere.rikkahub.server.model.MessageNode
import me.rerere.ai.ui.UIMessage
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.Instant
import kotlin.uuid.Uuid

object ConversationDao {

    fun findById(id: Uuid): Conversation? = transaction {
        Conversations.selectAll().where { Conversations.id eq id.toString() }
            .map { it.toConversation() }
            .singleOrNull()
    }

    fun findByAssistantId(
        assistantId: Uuid,
        offset: Int = 0,
        limit: Int = 20
    ): List<Conversation> = transaction {
        Conversations.selectAll()
            .where { Conversations.assistantId eq assistantId.toString() }
            .orderBy(Conversations.updateAt to SortOrder.DESC)
            .offset(offset.toLong())
            .limit(limit)
            .map { it.toConversation() }
    }

    fun findAll(offset: Int = 0, limit: Int = 20): List<Conversation> = transaction {
        Conversations.selectAll()
            .orderBy(Conversations.updateAt to SortOrder.DESC)
            .offset(offset.toLong())
            .limit(limit)
            .map { it.toConversation() }
    }

    fun count(): Long = transaction {
        Conversations.selectAll().count()
    }

    fun insert(conversation: Conversation): Conversation = transaction {
        Conversations.insert {
            it[id] = conversation.id.toString()
            it[assistantId] = conversation.assistantId.toString()
            it[title] = conversation.title
            it[messageNodes] = json.encodeToString(conversation.messageNodes)
            it[chatSuggestions] = json.encodeToString(conversation.chatSuggestions)
            it[isPinned] = conversation.isPinned
            it[createAt] = Instant.ofEpochMilli(conversation.createAt)
            it[updateAt] = Instant.ofEpochMilli(conversation.updateAt)
        }
        conversation
    }

    fun update(conversation: Conversation): Conversation = transaction {
        Conversations.update({ Conversations.id eq conversation.id.toString() }) {
            it[title] = conversation.title
            it[messageNodes] = json.encodeToString(conversation.messageNodes)
            it[chatSuggestions] = json.encodeToString(conversation.chatSuggestions)
            it[isPinned] = conversation.isPinned
            it[updateAt] = Instant.ofEpochMilli(System.currentTimeMillis())
        }
        conversation.copy(updateAt = System.currentTimeMillis())
    }

    fun delete(id: Uuid): Boolean = transaction {
        Conversations.deleteWhere { Conversations.id eq id.toString() } > 0
    }

    fun updateTitle(id: Uuid, title: String): Boolean = transaction {
        Conversations.update({ Conversations.id eq id.toString() }) {
            it[Conversations.title] = title
            it[updateAt] = Instant.now()
        } > 0
    }

    fun updatePinned(id: Uuid, pinned: Boolean): Boolean = transaction {
        Conversations.update({ Conversations.id eq id.toString() }) {
            it[isPinned] = pinned
            it[updateAt] = Instant.now()
        } > 0
    }

    private fun ResultRow.toConversation(): Conversation {
        return Conversation(
            id = Uuid.parse(this[Conversations.id]),
            assistantId = Uuid.parse(this[Conversations.assistantId]),
            title = this[Conversations.title],
            messageNodes = json.decodeFromString(this[Conversations.messageNodes]),
            chatSuggestions = json.decodeFromString(this[Conversations.chatSuggestions]),
            isPinned = this[Conversations.isPinned],
            createAt = this[Conversations.createAt].toEpochMilli(),
            updateAt = this[Conversations.updateAt].toEpochMilli()
        )
    }
}

fun Conversation.toDto(isGenerating: Boolean = false) = ConversationDto(
    id = id.toString(),
    assistantId = assistantId.toString(),
    title = title,
    messages = messageNodes.map { it.toDto() },
    chatSuggestions = chatSuggestions,
    isPinned = isPinned,
    createAt = createAt,
    updateAt = updateAt,
    isGenerating = isGenerating
)

fun Conversation.toListDto(isGenerating: Boolean = false) = ConversationListDto(
    id = id.toString(),
    assistantId = assistantId.toString(),
    title = title,
    isPinned = isPinned,
    createAt = createAt,
    updateAt = updateAt,
    isGenerating = isGenerating
)

fun MessageNode.toDto() = MessageNodeDto(
    id = id.toString(),
    messages = messages.map { it.toDto() },
    selectIndex = selectIndex
)

fun UIMessage.toDto() = MessageDto(
    id = id.toString(),
    role = role.name,
    parts = parts,
    annotations = annotations,
    createdAt = createdAt.toString(),
    finishedAt = finishedAt?.toString(),
    modelId = modelId?.toString(),
    usage = usage,
    translation = translation
)