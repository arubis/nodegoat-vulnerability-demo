defmodule Rsolv.EmailServiceUnsubscribeTest do
  use Rsolv.DataCase, async: false

  alias Rsolv.EmailOptOutService
  alias Rsolv.EmailManagement

  test "is_unsubscribed? integration with email service" do
    # Reset any cache
    :persistent_term.erase({EmailOptOutService, :unsubscribed_emails})

    try do
      # Add a test email to unsubscribed list
      test_email = "unsubscribed@example.com"

      # Record unsubscribe
      :ok = EmailOptOutService.record_unsubscribe(test_email)

      # Test that it's marked as unsubscribed using database
      assert EmailManagement.is_unsubscribed?(test_email)

      # Test with variant casing
      assert EmailManagement.is_unsubscribed?(String.upcase(test_email))

      # Test that other emails are not marked as unsubscribed
      refute EmailManagement.is_unsubscribed?("subscribed@example.com")
    after
      # Reset cache
      :persistent_term.erase({EmailOptOutService, :unsubscribed_emails})
    end
  end

end