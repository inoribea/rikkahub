package me.rerere.rikkahub.server.db

import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.SchemaUtils
import org.jetbrains.exposed.sql.transactions.TransactionManager
import org.jetbrains.exposed.sql.transactions.transaction
import java.io.File
import java.sql.Connection

object DatabaseFactory {
    fun init(dbPath: String = "data/rikkahub.db") {
        val file = File(dbPath)
        file.parentFile?.mkdirs()

        val db = Database.connect(
            url = "jdbc:sqlite:$dbPath",
            driver = "org.sqlite.JDBC"
        )

        TransactionManager.manager.defaultIsolationLevel = Connection.TRANSACTION_SERIALIZABLE

        transaction {
            SchemaUtils.create(
                me.rerere.rikkahub.server.db.tables.Conversations,
                me.rerere.rikkahub.server.db.tables.Assistants,
                me.rerere.rikkahub.server.db.tables.Settings,
                me.rerere.rikkahub.server.db.tables.UploadedFiles,
                me.rerere.rikkahub.server.db.tables.Memories
            )
        }
    }
}