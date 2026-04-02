package me.rerere.rikkahub.server.db.dao

import me.rerere.ai.util.json
import me.rerere.rikkahub.server.db.tables.Settings
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction

object SettingsDao {

    inline fun <reified T> get(key: String, default: T): T = transaction {
        Settings.selectAll().where { Settings.key eq key }
            .map { it[Settings.value] }
            .singleOrNull()
            ?.let { json.decodeFromString(it) }
            ?: default
    }

    inline fun <reified T> set(key: String, value: T) = transaction {
        val jsonValue = json.encodeToString(value)
        val exists = Settings.selectAll().where { Settings.key eq key }.count() > 0

        if (exists) {
            Settings.update({ Settings.key eq key }) {
                it[Settings.value] = jsonValue
            }
        } else {
            Settings.insert {
                it[Settings.key] = key
                it[Settings.value] = jsonValue
            }
        }
    }

    fun delete(key: String) = transaction {
        Settings.deleteWhere { Settings.key eq key } > 0
    }
}