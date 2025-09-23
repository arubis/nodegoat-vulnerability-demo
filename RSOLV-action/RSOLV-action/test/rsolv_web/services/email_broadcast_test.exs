defmodule RsolvWeb.Services.EmailBroadcastTest do
  use Rsolv.DataCase, async: true
  alias Rsolv.EmailService

  describe "email delivery" do
    # Use test environment so test adapter is allowed
    setup do
      # Set ConvertKit test config
      Application.put_env(:rsolv, :convertkit, [
        api_key: "test_api_key",
        form_id: "test_form_id",
        early_access_tag_id: "test_tag_id",
        api_base_url: "https://api.convertkit.com/v3"
      ])

      # Set up Bamboo test adapter for email delivery
      Application.put_env(:rsolv, Rsolv.Mailer, adapter: Bamboo.TestAdapter)

      :ok
    end

    test "handles welcome email delivery with current implementation" do
      result = EmailService.send_welcome_email("test@example.com", "Test")

      # Assert that the email was sent successfully
      assert {:ok, data} = result
      assert data.status == "sent"
      assert Map.has_key?(data, :email)
    end

    test "handles early access welcome email delivery" do
      result = EmailService.send_early_access_welcome_email("test@example.com", "Test")

      # Assert that the email was sent successfully
      assert {:ok, data} = result
      assert data.status == "sent"
      assert Map.has_key?(data, :email)
    end
  end
end