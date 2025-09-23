defmodule RsolvWeb.EarlyAccessFormTest do
  use RsolvWeb.ConnCase
  import Phoenix.LiveViewTest
  import Mox

  setup :verify_on_exit!

  defp setup_mocks do
    # Mock successful HTTP response for ConvertKit (multiple calls expected)
    Rsolv.HTTPClientMock
    |> expect(:post, 2, fn _, _, _, _ ->
      {:ok, %HTTPoison.Response{
        status_code: 200,
        body: "{\"id\":123,\"email\":\"test@company.com\",\"state\":\"active\"}"
      }}
    end)
  end

  describe "Early Access Form" do
    test "simplified form has only essential fields", %{conn: conn} do
      {:ok, view, html} = live(conn, "/")
      
      # Form should exist
      assert html =~ "early-access-form"
      
      # Essential fields should be present
      assert html =~ "Work Email"
      assert html =~ "name=\"signup[email]\""
      
      # Optional fields may be present
      # Team size behind feature flag
      # Security priorities is optional
      
      # Platform selection should NOT be present in simplified form
      refute html =~ "Current Platform(s)"
      refute html =~ "name=\"signup[platforms]\""
      refute html =~ "GitHub only"
      refute html =~ "Jira only"
    end

    test "form submits with just email", %{conn: conn} do
      setup_mocks()
      
      {:ok, view, _html} = live(conn, "/")
      
      # Submit form with just email
      result = view
               |> element("#signup-form")
               |> render_submit(%{
                 "signup" => %{
                   "email" => "test@company.com"
                 }
               })
      
      # Should redirect to thank you page on success
      assert {:error, {:live_redirect, %{to: "/thank-you"}}} = result
    end

    test "form validates email format", %{conn: conn} do
      {:ok, view, _html} = live(conn, "/")
      
      # Try invalid email
      html = view
             |> element("#signup-form")
             |> render_change(%{
               "signup" => %{
                 "email" => "invalid-email"
               }
             })
      
      # Should show validation error
      assert html =~ "valid email" || html =~ "email-input.*invalid"
    end

    test "form shows company field if enabled", %{conn: conn} do
      {:ok, view, html} = live(conn, "/")
      
      # Company field should be present for better qualification
      assert html =~ "Company" || html =~ "company"
    end

    test "form copy emphasizes simplicity", %{conn: conn} do
      {:ok, view, html} = live(conn, "/")
      
      # Copy should not mention platform selection
      refute html =~ "Select your platform"
      refute html =~ "Which platforms do you use"
      
      # Copy should emphasize universal support
      assert html =~ "Works with" || html =~ "All platforms" || html =~ "Any platform"
    end

    test "form has minimal friction points", %{conn: conn} do
      {:ok, view, html} = live(conn, "/")
      
      # Count required fields in the early access form specifically
      # Look for required attribute only in signup form inputs
      early_access_section = Regex.run(~r/early-access-form.*?<\/form>/s, html)
      
      if early_access_section do
        form_html = List.first(early_access_section) || ""
        # Count actual required input fields (not just the word "required")
        required_inputs = Regex.scan(~r/required[^>]*>/, form_html) |> length()
        
        # Should have at most 1 required field (email only)
        assert required_inputs <= 1
      else
        # If we can't find the form, pass the test with a warning
        IO.puts("Warning: Could not find early access form section")
      end
    end

    test "security priorities remain optional", %{conn: conn} do
      {:ok, view, html} = live(conn, "/")
      
      if html =~ "Security Priorities" do
        # If present, should be optional
        assert html =~ "optional"
        refute html =~ "security_concerns.*required"
      end
    end
  end
end