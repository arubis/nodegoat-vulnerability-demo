defmodule Rsolv.Integration.EmailDeliveryTest do
  use Rsolv.DataCase, async: false
  use Bamboo.Test
  
  alias Rsolv.EmailService
  
  setup do
    # Clear any previous test emails
    Bamboo.SentEmail.reset()
    
    # Clear unsubscribe cache to ensure emails are sent
    try do
      :persistent_term.erase({Rsolv.EmailOptOutService, :unsubscribed_emails})
    rescue
      _ -> :ok
    end
    
    :ok
  end
  
  describe "email delivery with Bamboo adapter" do
    test "successfully sends welcome email in test environment" do
      # Clear previous emails
      Bamboo.SentEmail.reset()
      
      # Send email directly through the service
      result = EmailService.send_welcome_email("fresh@example.com", "FreshUser")
      
      # Check what was returned
      email = case result do
        {:ok, %{status: "sent", email: {:ok, email}}} ->
          # Email was sent and we have it in the result
          # Bamboo.TestAdapter doesn't store emails in Bamboo.SentEmail,
          # but we can use the returned email
          email
        {:ok, %{status: "sent"}} ->
          # Fallback - try to get from Bamboo.SentEmail
          emails = Bamboo.SentEmail.all()
          assert length(emails) > 0, "No emails were captured"
          [email | _] = emails
          email
        {:skipped, reason} ->
          flunk("Email was skipped: #{inspect(reason)}")
        other ->
          flunk("Unexpected result: #{inspect(other)}")
      end
      
      # Verify email properties
      assert email.to == [nil: "fresh@example.com"]
      assert email.from == {"RSOLV Team", "support@rsolv.dev"}
      assert email.subject =~ "Welcome to RSOLV"
      assert email.html_body =~ "FreshUser"
    end
    
    test "successfully sends early access welcome email" do
      # Clear previous emails
      Bamboo.SentEmail.reset()
      
      result = EmailService.send_early_access_welcome_email("earlybird@example.com", "EarlyBird")
      
      assert {:ok, %{status: "sent", email: {:ok, email}}} = result
      
      # Verify email content
      assert email.subject =~ "Early Access Program"
      assert email.html_body =~ "EarlyBird"
      assert email.html_body =~ "exclusive group"
      assert email.private.tag == "early-access"
    end
    
    test "respects unsubscribe preferences" do
      # First mark an email as unsubscribed
      Rsolv.EmailOptOutService.record_unsubscribe("opted-out@example.com")
      
      # Try to send to unsubscribed email
      result = EmailService.send_welcome_email("opted-out@example.com")
      
      # Should be skipped
      assert {:skipped, %{status: "unsubscribed"}} = result
      
      # No emails should be delivered
      assert_no_emails_delivered()
    end
    
    test "email structure follows expected format" do
      # Clear previous emails
      Bamboo.SentEmail.reset()
      
      result = EmailService.send_early_access_welcome_email("structure@example.com")
      assert {:ok, %{status: "sent", email: {:ok, email}}} = result
      
      # Check headers
      assert email.headers["X-Postmark-Tag"] == "early-access"
      
      # Check both HTML and text versions exist
      assert is_binary(email.html_body)
      assert is_binary(email.text_body)
      
      # Check for required content
      assert email.html_body =~ "RSOLV-dev/rsolv-action@v1"
      assert email.html_body =~ "Unsubscribe"
      assert email.text_body =~ "Early Access Program"
    end
  end
  
  describe "LocalAdapter behavior in development" do
    test "emails are captured but not actually sent" do
      # In test environment, Bamboo.TestAdapter captures emails
      # In dev environment, Bamboo.LocalAdapter would display them in browser
      
      result = EmailService.send_welcome_email("local@example.com")
      
      # Check that email was sent successfully
      assert {:ok, %{status: "sent", email: {:ok, email}}} = result
      
      # Verify the email
      assert email.to == [nil: "local@example.com"]
    end
  end
end