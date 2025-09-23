defmodule Rsolv.EmailsTest do
  use ExUnit.Case, async: true
  use Bamboo.Test

  alias Rsolv.Emails

  describe "welcome_email/2" do
    test "generates a welcome email with default name" do
      email = Emails.welcome_email("test@example.com")

      assert email.to == "test@example.com"
      assert email.from == {"RSOLV Team", "support@rsolv.dev"}
      assert email.subject =~ "Welcome to RSOLV"
      assert email.html_body =~ "Thanks for trying RSOLV"
      assert email.html_body =~ "there" # Default name
      assert email.private.tag == "welcome"
    end
    
    test "generates a welcome email with provided name" do
      email = Emails.welcome_email("test@example.com", "Alice")
      
      assert email.to == "test@example.com"
      assert email.html_body =~ "Alice"
      refute email.html_body =~ "there"
    end
  end
  
  describe "early_access_welcome_email/2" do
    test "generates an early access welcome email" do
      email = Emails.early_access_welcome_email("test@example.com", "Bob")

      assert email.to == "test@example.com"
      assert email.from == {"RSOLV Team", "support@rsolv.dev"}
      assert email.subject =~ "Early Access Program"
      assert email.html_body =~ "Bob"
      assert email.html_body =~ "Early Access Program"
      assert email.private.tag == "early-access"
    end
  end
  
  describe "getting_started_email/2" do
    test "generates a getting started email" do
      email = Emails.getting_started_email("test@example.com")
      
      assert email.to == "test@example.com"
      assert email.subject =~ "Getting Started"
      assert email.html_body =~ "quick overview"
    end
  end
  
  describe "admin_signup_notification/1" do
    test "creates admin notification email with signup data" do
      signup_data = %{
        email: "test@example.com",
        company: "Test Company",
        timestamp: "2025-06-20T14:00:00Z",
        source: "landing_page", 
        utm_source: "twitter",
        utm_medium: "social",
        utm_campaign: "launch",
        referrer: "https://twitter.com/some_post"
      }
      
      email = Emails.admin_signup_notification(signup_data)
      
      # Check basic email properties
      assert email.subject == "🎉 New RSOLV Signup: test@example.com"
      assert email.from == {"RSOLV Team", "support@rsolv.dev"}
      
      # During Postmark trial, only send to @rsolv.dev emails
      assert Enum.all?(email.to, fn recipient ->
        case recipient do
          {_name, email_address} -> String.ends_with?(email_address, "@rsolv.dev")
          email_address when is_binary(email_address) -> String.ends_with?(email_address, "@rsolv.dev")
          _ -> false
        end
      end)
      
      # Check headers
      assert email.headers["X-Postmark-Tag"] == "admin-notification"
      assert email.headers["X-Priority"] == "1"
      assert email.headers["Message-ID"] != nil
      
      # Check HTML body contains key information
      html_body = email.html_body
      assert html_body =~ "test@example.com"
      assert html_body =~ "Test Company"
      assert html_body =~ "twitter"
      assert html_body =~ "social"
      assert html_body =~ "launch"
      assert html_body =~ "twitter.com"
      
      # Check text body contains key information  
      text_body = email.text_body
      assert text_body =~ "test@example.com"
      assert text_body =~ "Test Company"
      assert text_body =~ "twitter"
      assert text_body =~ "View full dashboard: https://rsolv.dev/live/dashboard"
    end
    
    test "handles missing optional fields gracefully" do
      signup_data = %{
        email: "minimal@example.com",
        timestamp: "2025-06-20T14:00:00Z"
      }
      
      email = Emails.admin_signup_notification(signup_data)
      
      assert email.subject == "🎉 New RSOLV Signup: minimal@example.com"
      
      # Check that missing fields don't break the template
      html_body = email.html_body
      assert html_body =~ "minimal@example.com"
      assert html_body =~ "landing_page" # default source
      refute html_body =~ "<div class=\"metric-label\">Company</div>" # no company section if not provided
    end
    
    test "formats timestamp correctly" do
      signup_data = %{
        email: "time@example.com",
        timestamp: "2025-06-20T14:30:45Z"
      }
      
      email = Emails.admin_signup_notification(signup_data)
      
      # Should format as human-readable date
      assert email.html_body =~ "June 20, 2025"
    end
  end
  
  describe "email_generation_helpers" do
    test "all emails have proper structure" do
      emails = [
        Emails.welcome_email("test@example.com"),
        Emails.early_access_welcome_email("test@example.com"),
        Emails.getting_started_email("test@example.com"),
        Emails.setup_verification_email("test@example.com"),
        Emails.first_issue_email("test@example.com"),
        Emails.feature_deep_dive_email("test@example.com"),
        Emails.feedback_request_email("test@example.com"),
        Emails.success_checkin_email("test@example.com")
      ]

      for email <- emails do
        assert email.from == {"RSOLV Team", "support@rsolv.dev"}
        assert is_binary(email.subject)
        assert is_binary(email.html_body)
        assert email.html_body =~ "RSOLV" # All emails should mention product name

        # Emails should have proper layout with footer
        assert email.html_body =~ "footer"
        assert email.html_body =~ "unsubscribe"

        # All emails should have a tag set
        assert Map.has_key?(email.private, :tag)
        assert is_binary(email.private.tag)
      end
    end

    test "email tags are set correctly" do
      # Create a mapping of email functions to expected tags
      email_tag_map = [
        {Emails.welcome_email("test@example.com"), "welcome"},
        {Emails.early_access_welcome_email("test@example.com"), "early-access"},
        {Emails.getting_started_email("test@example.com"), "getting-started"},
        {Emails.setup_verification_email("test@example.com"), "setup-verification"},
        {Emails.first_issue_email("test@example.com"), "first-issue"},
        {Emails.feature_deep_dive_email("test@example.com"), "feature-deep-dive"},
        {Emails.feedback_request_email("test@example.com"), "feedback-request"},
        {Emails.success_checkin_email("test@example.com"), "success-checkin"}
      ]

      for {email, expected_tag} <- email_tag_map do
        assert email.private.tag == expected_tag,
          "Expected tag '#{expected_tag}' for #{inspect(email.subject)}, got '#{email.private.tag}'"
      end
    end
  end
end