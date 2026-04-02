plugins {
    kotlin("jvm")
    kotlin("plugin.serialization")
}

dependencies {
    api(project(":common-core"))

    api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    api("org.jetbrains.kotlinx:kotlinx-datetime:0.6.2")

    implementation("org.slf4j:slf4j-api:2.0.17")
    implementation("org.apache.commons:commons-text:1.13.0")

    testImplementation(kotlin("test"))
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions.optIn.add("kotlin.uuid.ExperimentalUuidApi")
    compilerOptions.optIn.add("kotlin.time.ExperimentalTime")
}
