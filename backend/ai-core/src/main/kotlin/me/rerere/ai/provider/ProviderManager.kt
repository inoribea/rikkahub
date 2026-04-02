package me.rerere.ai.provider

import me.rerere.ai.provider.providers.ClaudeProvider
import me.rerere.ai.provider.providers.GoogleProvider
import me.rerere.ai.provider.providers.OpenAIProvider
import okhttp3.OkHttpClient
import java.io.File

/**
 * Provider管理器，负责注册和获取Provider实例
 */
class ProviderManager(client: OkHttpClient, cacheDir: File? = null) {
    // 存储已注册的Provider实例
    private val providers = mutableMapOf<String, Provider<*>>()

    init {
        // 注册默认Provider
        registerProvider("openai", OpenAIProvider(client, cacheDir))
        registerProvider("google", GoogleProvider(client, cacheDir))
        registerProvider("claude", ClaudeProvider(client, cacheDir))
    }

    /**
     * 注册Provider实例
     */
    fun registerProvider(name: String, provider: Provider<*>) {
        providers[name] = provider
    }

    /**
     * 获取Provider实例
     */
    fun getProvider(name: String): Provider<*> {
        return providers[name] ?: throw IllegalArgumentException("Provider not found: $name")
    }

    /**
     * 根据ProviderSetting获取对应的Provider实例
     */
    fun <T : ProviderSetting> getProviderByType(setting: T): Provider<T> {
        @Suppress("UNCHECKED_CAST")
        return when (setting) {
            is ProviderSetting.OpenAI -> getProvider("openai")
            is ProviderSetting.Google -> getProvider("google")
            is ProviderSetting.Claude -> getProvider("claude")
        } as Provider<T>
    }
}
