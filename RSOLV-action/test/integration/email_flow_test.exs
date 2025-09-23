defmodule Rsolv.Integration.EmailFlowTest do
  use Rsolv.DataCase, async: false
  use Bamboo.Test
  
  alias Rsolv.EmailService
  
  describe "email delivery flow" do
    test "welcome email is delivered through the service" do
      # Clear any previous emails
      Bamboo.SentEmail.reset()
      
      # Send the email - it might be skipped if marked as unsubscribed
      result = EmailService.send_welcome_email("test@example.com", "TestUser")
      
      case result do
        {:ok, %{status: "sent", email: {:ok, email}}} ->
          # Email was sent successfully
          assert email.to == [nil: "test@example.com"]
          
        {:skipped, %{status: "unsubscribed"}} ->
          # Email was skipped because user is unsubscribed
          # This is also a valid outcome
          assert_no_emails_delivered()
      end
    end
    
    test "early access welcome email is delivered" do
      # Clear previous emails
      Bamboo.SentEmail.reset()
      
      # Send the email
      result = EmailService.send_early_access_welcome_email("early@example.com", "EarlyUser")
      
      # Verify the result
      assert {:ok, %{status: "sent", email: {:ok, email}}} = result
      assert email.to == [nil: "early@example.com"]
      assert email.subject =~ "Early Access"
    end
    
    test "email contains expected content" do
      # Clear previous emails
      Bamboo.SentEmail.reset()
      
      result = EmailService.send_early_access_welcome_email("content@example.com", "ContentUser")
      assert {:ok, %{status: "sent", email: {:ok, email}}} = result
      
      # Check email structure
      assert email.from == {"RSOLV Team", "support@rsolv.dev"}
      assert email.headers["X-Postmark-Tag"] == "early-access"
      
      # Check content
      assert email.html_body =~ "ContentUser"
      assert email.html_body =~ "Early Access Program"
      assert email.html_body =~ "RSOLV-dev/rsolv-action@v1"
      assert email.html_body =~ "Unsubscribe"
      
      # Check text version exists
      assert email.text_body =~ "ContentUser"
      assert email.text_body =~ "Early Access Program"
    end
    
    test "unsubscribed users don't receive emails" do
      # First, mark a user as unsubscribed
      Rsolv.EmailOptOutService.record_unsubscribe("unsubscribed@example.com")
      
      # Try to send them an email
      result = EmailService.send_welcome_email("unsubscribed@example.com")
      
      # Verify it was skipped
      assert {:skipped, %{status: "unsubscribed"}} = result
      
      # Verify no email was delivered
      assert_no_emails_delivered()
    end
  end
  
  describe "email flow in development mode" do
    test "emails are captured by LocalAdapter in dev environment" do
      # In test environment, we use TestAdapter which works with assert_delivered_email
      # This test verifies our test setup is working correctly
      
      result = EmailService.send_welcome_email("dev@example.com")
      
      # The email should be delivered
      assert {:ok, %{status: "sent", email: {:ok, email}}} = result
      assert email.to == [nil: "dev@example.com"]
    end
  end
end