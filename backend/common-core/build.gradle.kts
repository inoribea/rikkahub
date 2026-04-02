plugins {
    kotlin("jvm")
    kotlin("plugin.serialization")
}

dependencies {
    api("com.squareup.okhttp3:okhttp:5.0.0-alpha.14")
    api("com.squareup.okhttp3:okhttp-sse:5.0.0-alpha.14")
    api("com.squareup.okhttp3:logging-interceptor:5.0.0-alpha.14")
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    api("org.jetbrains.kotlinx:kotlinx-datetime:0.6.2")
    api("org.apache.commons:commons-text:1.13.0")

    testImplementation(kotlin("test"))
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions.optIn.add("kotlin.uuid.ExperimentalUuidApi")
    compilerOptions.optIn.add("kotlin.time.ExperimentalTime")
}
