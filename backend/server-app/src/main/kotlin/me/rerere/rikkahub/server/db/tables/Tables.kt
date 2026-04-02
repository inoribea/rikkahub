package me.rerere.rikkahub.server.db.tables

import org.jetbrains.exposed.dao.id.LongIdTable
import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.timestamp

object Conversations : Table("conversations") {
    val id = varchar("id", 36)
    val assistantId = varchar("assistant_id", 36)
    val title = varchar("title", 255)
    val messageNodes = text("message_nodes")
    val chatSuggestions = text("chat_suggestions")
    val isPinned = bool("is_pinned").default(false)
    val createAt = timestamp("create_at")
    val updateAt = timestamp("update_at")

    override val primaryKey = PrimaryKey(id)
}

object Assistants : Table("assistants") {
    val id = varchar("id", 36)
    val data = text("data")
    val createAt = timestamp("create_at")
    val updateAt = timestamp("update_at")

    override val primaryKey = PrimaryKey(id)
}

object Settings : Table("settings") {
    val key = varchar("key", 64)
    val value = text("value")

    override val primaryKey = PrimaryKey(key)
}

object UploadedFiles : LongIdTable("uploaded_files") {
    val fileName = varchar("file_name", 255)
    val mime = varchar("mime", 64)
    val size = long("size")
    val path = varchar("path", 512)
    val createAt = timestamp("create_at")
}

object Memories : Table("memories") {
    val id = long("id").autoIncrement()
    val assistantId = varchar("assistant_id", 36)
    val content = text("content")
    val createAt = timestamp("create_at")

    override val primaryKey = PrimaryKey(id)
}