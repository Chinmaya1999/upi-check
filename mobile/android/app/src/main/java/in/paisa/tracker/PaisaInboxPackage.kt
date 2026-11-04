package `in`.paisa.tracker

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class PaisaInboxPackage : ReactPackage {
  override fun createNativeModules(c: ReactApplicationContext): List<NativeModule> = listOf(PaisaInboxModule(c))
  override fun createViewManagers(c: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
