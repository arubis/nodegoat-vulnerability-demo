defmodule RsolvWeb.Plugs.FeatureFlagPlugTest do
  use RsolvWeb.ConnCase
  
  alias RsolvWeb.Plugs.FeatureFlagPlug
  # Removed unused alias Rsolv.FeatureFlags
  
  # We need to set up some test config for the feature flags
  setup do
    # Save current application environment
    saved_config = Application.get_all_env(:rsolv)
    
    # Set up test config
    Application.put_env(:rsolv, :enabled_features, [:enabled_test_feature])
    Application.put_env(:rsolv, :disabled_features, [:disabled_test_feature])
    
    # Return a function to restore the saved config after the test
    on_exit(fn ->
      # Clear the test configs
      Application.delete_env(:rsolv, :enabled_features)
      Application.delete_env(:rsolv, :disabled_features)
      
      # Restore saved configs
      Enum.each(saved_config, fn {key, value} ->
        Application.put_env(:rsolv, key, value)
      end)
    end)
    
    # We need a conn for testing with the session fetched
    conn = Phoenix.ConnTest.build_conn() 
           |> Plug.Test.init_test_session(%{})
           |> Phoenix.Controller.fetch_flash()
           
    {:ok, conn: conn}
  end
  
  describe "init/1" do
    test "requires feature option" do
      assert_raise KeyError, fn ->
        FeatureFlagPlug.init([])
      end
    end
    
    test "sets default values for optional parameters" do
      opts = FeatureFlagPlug.init(feature: :test_feature)
      assert opts.feature == :test_feature
      assert opts.fallback_url == "/"
      assert opts.message == "This feature is currently unavailable."
    end
    
    test "allows overriding default values" do
      opts = FeatureFlagPlug.init(
        feature: :test_feature,
        fallback_url: "/custom-fallback",
        message: "Custom message"
      )
      
      assert opts.feature == :test_feature
      assert opts.fallback_url == "/custom-fallback"
      assert opts.message == "Custom message"
    end
  end
  
  describe "call/2" do
    test "allows access when feature is enabled", %{conn: conn} do
      # Ensure the feature is enabled in FunWithFlags
      FunWithFlags.enable(:enabled_test_feature)
      
      # Initialize the plug
      opts = FeatureFlagPlug.init(feature: :enabled_test_feature)
      
      # Call the plug with the conn
      result_conn = FeatureFlagPlug.call(conn, opts)
      
      # The connection should be unchanged
      assert result_conn == conn
    end
    
    test "redirects when feature is disabled", %{conn: conn} do
      # Ensure the feature is disabled in FunWithFlags
      FunWithFlags.disable(:disabled_test_feature)
      
      # Initialize the plug
      opts = FeatureFlagPlug.init(
        feature: :disabled_test_feature,
        fallback_url: "/fallback",
        message: "Test message"
      )
      
      # Call the plug with the conn
      result_conn = FeatureFlagPlug.call(conn, opts)
      
      # The connection should be redirected
      assert result_conn.status == 302
      assert redirected_to(result_conn) == "/fallback"
      
      # Flash message should be set
      # Use Phoenix.Flash instead of the deprecated Phoenix.ConnTest.get_flash/2
      assert Phoenix.Flash.get(result_conn.assigns.flash, "info") == "Test message"
      
      # Conn should be halted
      assert result_conn.halted
    end
  end
  
  describe "helper functions" do
    test "admin_dashboard/0 returns correct options" do
      opts = FeatureFlagPlug.admin_dashboard()
      assert opts.feature == :admin_dashboard
      assert String.contains?(opts.message, "Admin dashboard")
    end
    
    test "metrics_dashboard/0 returns correct options" do
      opts = FeatureFlagPlug.metrics_dashboard()
      assert opts.feature == :metrics_dashboard
      assert String.contains?(opts.message, "Metrics dashboard")
    end
    
    test "feedback_dashboard/0 returns correct options" do
      opts = FeatureFlagPlug.feedback_dashboard()
      assert opts.feature == :feedback_dashboard
      assert String.contains?(opts.message, "Feedback dashboard")
    end
  end
end