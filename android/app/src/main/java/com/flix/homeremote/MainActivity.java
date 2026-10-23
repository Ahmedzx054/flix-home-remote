package com.flix.homeremote;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HomeDiscoveryPlugin.class);
        registerPlugin(DirectLanPlugin.class);
        registerPlugin(DirectAdbPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
