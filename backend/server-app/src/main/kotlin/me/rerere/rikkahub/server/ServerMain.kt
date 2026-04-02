package me.rerere.rikkahub.server

import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.engine.*
import io.ktor.server.cio.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import me.rerere.ai.util.json
import me.rerere.rikkahub.server.db.DatabaseFactory
import me.rerere.rikkahub.server.dto.ErrorResponse
import me.rerere.rikkahub.server.routes.conversationRoutes
import me.rerere.rikkahub.server.routes.filesRoutes
import me.rerere.rikkahub.server.routes.settingsRoutes

fun main() {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8080
    val dbPath = System.getenv("DB_PATH") ?: "data/rikkahub.db"

    DatabaseFactory.init(dbPath)

    embeddedServer(CIO, port = port, module = Application::module)
        .start(wait = true)
}

fun Application.module() {
    install(ContentNegotiation) {
        json(json)
    }

    install(CORS) {
        anyHost()
        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.Authorization)
        allowHeader("X-Requested-With")
    }

    install(StatusPages) {
        exception<Throwable> { call, cause ->
            call.respond(
                HttpStatusCode.InternalServerError,
                ErrorResponse(cause.message ?: "Unknown error", 500)
            )
        }
    }

    routing {
        route("/api") {
            conversationRoutes()
            settingsRoutes()
            filesRoutes()
        }

        get("/health") {
            call.respond(mapOf("status" to "ok"))
        }
    }
}