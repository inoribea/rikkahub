package me.rerere.rikkahub.server.db.dao

import me.rerere.ai.util.json
import me.rerere.rikkahub.server.db.tables.Assistants
import me.rerere.rikkahub.server.model.Assistant
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.Instant
import kotlin.uuid.Uuid

object AssistantDao {

    fun findById(id: Uuid): Assistant? = transaction {
        Assistants.selectAll().where { Assistants.id eq id.toString() }
            .map { it.toAssistant() }
            .singleOrNull()
    }

    fun findAll(): List<Assistant> = transaction {
        Assistants.selectAll()
            .orderBy(Assistants.createAt to SortOrder.ASC)
            .map { it.toAssistant() }
    }

    fun insert(assistant: Assistant): Assistant = transaction {
        Assistants.insert {
            it[id] = assistant.id.toString()
            it[data] = json.encodeToString(assistant)
            it[createAt] = Instant.now()
            it[updateAt] = Instant.now()
        }
        assistant
    }

    fun update(assistant: Assistant): Assistant = transaction {
        Assistants.update({ Assistants.id eq assistant.id.toString() }) {
            it[data] = json.encodeToString(assistant)
            it[updateAt] = Instant.now()
        }
        assistant
    }

    fun delete(id: Uuid): Boolean = transaction {
        Assistants.deleteWhere { Assistants.id eq id.toString() } > 0
    }

    private fun ResultRow.toAssistant(): Assistant {
        return json.decodeFromString(this[Assistants.data])
    }
}