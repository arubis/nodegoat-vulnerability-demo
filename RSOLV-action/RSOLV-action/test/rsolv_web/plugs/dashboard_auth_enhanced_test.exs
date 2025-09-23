defmodule RsolvWeb.Plugs.DashboardAuthEnhancedTest do
  use RsolvWeb.ConnCase
  alias RsolvWeb.Plugs.DashboardAuthEnhanced
  
  setup do
    # Store original config
    original_password = Application.get_env(:rsolv, :admin_password)
    original_emails = Application.get_env(:rsolv, :admin_emails)
    
    # Set test config
    Application.put_env(:rsolv, :admin_password, "test123")
    Application.put_env(:rsolv, :admin_emails, ["admin@test.com"])
    
    on_exit(fn ->
      # Restore original config
      Application.put_env(:rsolv, :admin_password, original_password)
      Application.put_env(:rsolv, :admin_emails, original_emails)
    end)
    
    :ok
  end
  
  describe "authentication" do
    test "allows access with valid credentials", %{conn: conn} do
      auth = Base.encode64("admin:test123")
      
      conn =
        conn
        |> put_req_header("authorization", "Basic #{auth}")
        |> DashboardAuthEnhanced.call([])
      
      assert conn.assigns[:current_user_email] == "admin@test.com"
      refute conn.halted
    end
    
    test "denies access with invalid credentials", %{conn: conn} do
      auth = Base.encode64("admin:wrong")
      
      conn =
        conn
        |> put_req_header("authorization", "Basic #{auth}")
        |> DashboardAuthEnhanced.call([])
      
      assert conn.status == 401
      assert conn.halted
    end
    
    test "denies access without credentials", %{conn: conn} do
      conn = DashboardAuthEnhanced.call(conn, [])
      
      assert conn.status == 401
      assert conn.halted
      assert get_resp_header(conn, "www-authenticate") == [~s(Basic realm="Admin Dashboard")]
    end
  end
  
  describe "feature flag checking" do
    test "allows access when feature is enabled", %{conn: conn} do
      auth = Base.encode64("admin:test123")
      
      # Enable a feature that admins have access to
      FunWithFlags.enable(:admin_dashboard)
      
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> Phoenix.Controller.fetch_flash()
        |> put_req_header("authorization", "Basic #{auth}")
        |> DashboardAuthEnhanced.call(require_feature: :admin_dashboard)
      
      refute conn.halted
      
      # Cleanup
      FunWithFlags.disable(:admin_dashboard)
    end
    
    test "denies access when feature is disabled", %{conn: conn} do
      auth = Base.encode64("admin:test123")
      
      # Use a feature that's in early_access (available to all including admin)
      # but can be disabled via FunWithFlags
      FunWithFlags.disable(:core_features)
      
      conn =
        conn
        |> Plug.Test.init_test_session(%{})
        |> Phoenix.Controller.fetch_flash()
        |> put_req_header("authorization", "Basic #{auth}")
        |> DashboardAuthEnhanced.call(require_feature: :core_features)
      
      assert conn.halted
      assert redirected_to(conn) == "/"
      assert Phoenix.Flash.get(conn.assigns.flash, :error) =~ "not available"
    end
    
    test "auth check happens before feature flag check", %{conn: conn} do
      # This is the key test - even with feature disabled,
      # invalid auth should fail BEFORE feature flag check
      
      auth = Base.encode64("wrong:wrong")
      
      conn =
        conn
        |> put_req_header("authorization", "Basic #{auth}")
        |> DashboardAuthEnhanced.call(require_feature: :admin_dashboard)
      
      # Should get 401 Unauthorized, not redirect
      assert conn.status == 401
      assert conn.halted
    end
  end
end