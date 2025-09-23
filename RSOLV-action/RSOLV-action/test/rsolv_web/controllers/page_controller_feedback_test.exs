defmodule RsolvWeb.PageControllerFeedbackTest do
  use RsolvWeb.ConnCase
  import Phoenix.ConnTest
  alias Rsolv.FeatureFlags

  # Enable feedback feature for tests by default
  setup do
    # Store the original values
    original_enabled = Application.get_env(:rsolv, :enabled_features, [])
    original_disabled = Application.get_env(:rsolv, :disabled_features, [])

    # Ensure feedback is enabled for tests by default
    Application.put_env(:rsolv, :enabled_features, [:feedback_form])
    Application.delete_env(:rsolv, :disabled_features)
    
    # Restore settings after test
    on_exit(fn ->
      Application.put_env(:rsolv, :enabled_features, original_enabled)
      Application.put_env(:rsolv, :disabled_features, original_disabled)
    end)
    
    :ok
  end
  
  describe "feedback page" do
    test "GET /feedback renders the feedback page", %{conn: conn} do
      # First verify feature flag is enabled for test
      assert FeatureFlags.enabled?(:feedback_form)
      
      # Request the feedback page
      conn = get(conn, ~p"/feedback")
      
      # Verify that the page renders successfully
      assert html_response(conn, 200) =~ "We'd Love Your Feedback"
      assert html_response(conn, 200) =~ "Share Your Thoughts"
    end
    
    test "shows the feedback form on the page", %{conn: conn} do
      conn = get(conn, ~p"/feedback")
      
      # Check for form elements
      assert html_response(conn, 200) =~ "feedback-form-container"
      assert html_response(conn, 200) =~ "form data-feedback-form"
      assert html_response(conn, 200) =~ "textarea id=\"feedback-content\""
      assert html_response(conn, 200) =~ "input type=\"email\" id=\"feedback-email\""
    end
    
  end
  
  describe "feedback link in header" do
    test "header contains a link to the feedback page", %{conn: conn} do
      # Request the home page
      conn = get(conn, ~p"/")
      
      # Check for the feedback link in the header
      assert html_response(conn, 200) =~ "href=\"/feedback\""
    end
  end
  
  describe "feedback link in footer" do
    test "footer contains a link to the feedback page", %{conn: conn} do
      # Request the home page
      conn = get(conn, ~p"/")
      
      # Check for the feedback link in the footer
      assert html_response(conn, 200) =~ "<a href=\"/feedback\""
    end
  end
end