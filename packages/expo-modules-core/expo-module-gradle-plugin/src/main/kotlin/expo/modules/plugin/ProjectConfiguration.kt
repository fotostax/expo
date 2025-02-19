// Copyright 2015-present 650 Industries. All rights reserved.

package expo.modules.plugin

import com.android.build.gradle.LibraryExtension
import expo.modules.plugin.android.applyLinerOptions
import expo.modules.plugin.android.applyPublishingVariant
import expo.modules.plugin.android.applySDKVersions
import expo.modules.plugin.android.createReleasePublication
import org.gradle.api.Project
import org.gradle.api.publish.PublishingExtension
import org.gradle.internal.extensions.core.extra

private const val defaultCompileSdkVersion = 34
private const val defaultMinSdkVersion = 23
private const val defaultTargetSdkVersion = 34

internal fun Project.applyDefaultPlugins() {
  plugins.apply("com.android.library")
  plugins.apply("kotlin-android")
}

internal fun Project.applyKotlin(kotlinVersion: String, kspVersion: String) {
  extra.set("kotlinVersion", kotlinVersion)
  extra.set("kspVersion", kspVersion)

  project.dependencies.add("implementation", "org.jetbrains.kotlin:kotlin-stdlib-jdk7:$kotlinVersion")
}

internal fun Project.applyDefaultDependencies() {
  val modulesCore = project.project(":expo-modules-core")
  if (project != modulesCore) {
    project.dependencies.add("implementation", project.project(":expo-modules-core"))
  }
}

internal fun Project.applyDefaultAndroidSdkVersions() {
  with(androidLibraryExtension()) {
    applySDKVersions(
      compileSdk = rootProject.extra.safeGet("compileSdkVersion")
        ?: logger.warnIfNotDefined("compileSdkVersion", 35),
      minSdk = rootProject.extra.safeGet("minSdkVersion")
        ?: logger.warnIfNotDefined("minSdkVersion", 24),
      targetSdk = rootProject.extra.safeGet("targetSdkVersion")
        ?: logger.warnIfNotDefined("targetSdkVersion", 34)
    )
    applyLinerOptions()
  }
}

internal fun Project.applyPublishing() {
  val libraryExtension = androidLibraryExtension()

  libraryExtension
    .applyPublishingVariant()

  afterEvaluate {
    publishingExtension()
      .publications
      .createReleasePublication(this)
  }
}

internal fun Project.androidLibraryExtension() = extensions.getByType(LibraryExtension::class.java)

internal fun Project.publishingExtension() = extensions.getByType(PublishingExtension::class.java)
