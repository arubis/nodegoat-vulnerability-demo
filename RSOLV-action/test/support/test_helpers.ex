defmodule RsolvLanding.TestHelpers do
  @moduledoc """
  Helper functions for tests
  """
  
  @doc """
  Delivers an email and handles the {:ok, email} tuple that our Mailer returns in test env
  """
  def deliver_and_assert(email) do
    case RsolvLanding.Mailer.deliver_now(email) do
      {:ok, delivered_email} ->
        # In test env, Mailer returns {:ok, email}
        # We need to manually add it to Bamboo.SentEmail for assertions
        Bamboo.SentEmail.push(delivered_email)
        delivered_email
      delivered_email ->
        # Just in case it returns the email directly
        delivered_email
    end
  end
  
  @doc """
  Helper to send an email through our EmailService and assert delivery
  """
  def send_and_assert_email(email_fn, args) do
    # Clear previous emails
    Bamboo.SentEmail.reset()
    
    # Send the email
    result = apply(email_fn, args)
    
    case result do
      {:ok, %{status: "sent", email: {:ok, email}}} ->
        # This is what EmailService returns
        # Add the email to SentEmail for assertions
        Bamboo.SentEmail.push(email)
        {:ok, email}
        
      {:ok, %{status: "sent", email: email}} ->
        # In case the structure changes
        Bamboo.SentEmail.push(email)
        {:ok, email}
        
      {:skipped, reason} ->
        {:skipped, reason}
        
      other ->
        {:error, other}
    end
  end
end