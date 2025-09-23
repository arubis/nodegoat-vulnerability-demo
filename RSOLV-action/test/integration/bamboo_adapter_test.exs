defmodule Rsolv.Integration.BambooAdapterTest do
  use Rsolv.DataCase, async: false
  use Bamboo.Test
  
  alias Rsolv.{Mailer, Emails}
  
  setup do
    # Clear any previous test emails
    Bamboo.SentEmail.reset()
    :ok
  end
  
  test "Bamboo TestAdapter captures emails directly" do
    # Create an email
    email = Emails.welcome_email("direct@test.com", "DirectUser")
    
    # Send it directly through Mailer
    result = Mailer.deliver_now(email)
    
    IO.inspect(result, label: "Mailer.deliver_now result")
    
    # Check what Bamboo captured
    delivered = Bamboo.SentEmail.all()
    IO.inspect(length(delivered), label: "Delivered emails count")
    
    # TestAdapter should capture the email
    assert_delivered_email email
  end
  
  test "verify test environment is using TestAdapter" do
    config = Application.get_env(:rsolv, Rsolv.Mailer)
    IO.inspect(config, label: "Mailer config")
    
    assert config[:adapter] == Bamboo.TestAdapter
  end
  
  test "LocalAdapter behavior vs TestAdapter" do
    # In dev, we use LocalAdapter which shows emails in browser
    # In test, we use TestAdapter which captures for assertions
    
    email = Emails.early_access_welcome_email("adapter@test.com")
    
    # This is what happens in our EmailService
    try do
      result = Mailer.deliver_now(email)
      IO.inspect(result, label: "Delivery result")
      
      # In test env, this should work
      assert_delivered_email email
    rescue
      e ->
        IO.inspect(e, label: "Error during delivery")
        raise e
    end
  end
end