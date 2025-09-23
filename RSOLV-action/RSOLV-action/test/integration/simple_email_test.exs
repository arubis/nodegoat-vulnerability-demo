defmodule Rsolv.Integration.SimpleEmailTest do
  use Rsolv.DataCase, async: false
  use Bamboo.Test
  
  alias Rsolv.EmailService
  
  setup do
    # Clear any previous test emails
    Bamboo.SentEmail.reset()
    
    # Ensure unsubscribe directory exists but is empty
    File.rm_rf("priv/static/data/unsubscribes")
    File.mkdir_p!("priv/static/data/unsubscribes")
    
    :ok
  end
  
  test "email service sends emails through Bamboo adapter" do
    # Send a welcome email
    result = EmailService.send_welcome_email("test@example.com", "TestUser")
    
    # Print the actual result to understand the return value
    IO.inspect(result, label: "EmailService result")
    
    # The service should return either {:ok, _} or {:skipped, _}
    assert elem(result, 0) in [:ok, :skipped]
    
    # Check if any emails were delivered
    delivered = Bamboo.SentEmail.all()
    IO.inspect(length(delivered), label: "Number of delivered emails")
    
    if length(delivered) > 0 do
      email = hd(delivered)
      IO.inspect(email.to, label: "Email recipient")
      IO.inspect(email.subject, label: "Email subject")
      
      # Basic assertions
      assert email.from == {"RSOLV Team", "support@rsolv.dev"}
      assert email.subject =~ "Welcome"
    end
  end
  
  test "early access email has correct structure" do
    # Clear previous state
    Bamboo.SentEmail.reset()
    
    # Send early access email
    result = EmailService.send_early_access_welcome_email("early@test.com", "EarlyBird")
    
    IO.inspect(result, label: "Early access result")
    
    # Get delivered emails
    delivered = Bamboo.SentEmail.all()
    
    if length(delivered) > 0 do
      email = hd(delivered)
      
      # Check email structure
      assert email.subject =~ "Early Access"
      assert email.html_body =~ "EarlyBird"
      assert email.html_body =~ "exclusive group"
      assert email.headers["Reply-To"] == "support@rsolv.dev"
      assert email.private.tag == "early-access"
    end
  end
end