defmodule RsolvWeb.Services.ConvertKitTest do
  use Rsolv.DataCase, async: true
  import Mox
  alias RsolvWeb.Services.ConvertKit
  alias Rsolv.HTTPClientMock

  # Make sure mocks are verified when the test exits
  setup :verify_on_exit!

  # Setup test environment
  setup do
    # Set ConvertKit test config
    Application.put_env(:rsolv, :convertkit, [
      api_key: "test_api_key",
      form_id: "test_form_id",
      early_access_tag_id: "test_tag_id",
      api_base_url: "https://api.convertkit.com/v3"
    ])
    
    # Configure the HTTP client to use the mock
    Application.put_env(:rsolv, :http_client, Rsolv.HTTPClientMock)

    # No file operations needed - using database now

    fixtures = RsolvWeb.Mocks.convertkit_fixtures()

    %{
      fixtures: fixtures,
      test_email: "test@example.com",
      test_tag_id: "test_tag_id"
    }
  end

  describe "subscribe_to_early_access/2" do
    test "successfully subscribes a user", %{fixtures: fixtures, test_email: email} do
      # Mock the HTTP call to return success
      expect(HTTPClientMock, :post, fn _url, _body, _headers, _options ->
        {:ok, fixtures.subscription_success}
      end)

      # Call the function
      result = ConvertKit.subscribe_to_early_access(email)

      # Assert on the result
      assert {:ok, response} = result
      assert response.status_code == 200
      assert response.subscription_id == 123456789
    end

    test "falls back to form-specific endpoint if subscribers endpoint fails", %{fixtures: fixtures, test_email: email} do
      # Mock HTTP calls, expecting 2 calls - one that fails and one that succeeds
      expect(HTTPClientMock, :post, 2, fn url, _body, _headers, _options ->
        if String.contains?(url, "/subscribers") do
          {:error, %HTTPoison.Error{reason: :timeout}}
        else
          {:ok, fixtures.subscription_success}
        end
      end)

      # Call the function
      result = ConvertKit.subscribe_to_early_access(email)

      # Assert that we got a successful result despite the first failure
      assert {:ok, response} = result
      assert response.status_code == 200
    end

    test "handles network errors", %{fixtures: fixtures, test_email: email} do
      # Mock all HTTP calls to fail
      expect(HTTPClientMock, :post, 2, fn _url, _body, _headers, _options ->
        fixtures.network_error
      end)

      # Call the function
      result = ConvertKit.subscribe_to_early_access(email)

      # Assert on the error handling
      assert {:error, error} = result
      assert error.reason == :econnrefused
    end

    test "includes UTM parameters in request body", %{test_email: email} do
      # Test data
      utm_params = %{
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "spring_launch",
        utm_term: "resolver_tool",
        utm_content: "banner_ad"
      }

      # Mock to inspect the request body
      expect(HTTPClientMock, :post, fn _url, body, _headers, _options ->
        # Decode the request body
        {:ok, decoded} = Jason.decode(body)

        # Check that UTM params are included in fields
        fields = decoded["fields"]
        assert fields["utm_source"] == "google"
        assert fields["utm_medium"] == "cpc"
        assert fields["utm_campaign"] == "spring_launch"
        assert fields["utm_term"] == "resolver_tool"
        assert fields["utm_content"] == "banner_ad"

        # Return success
        {:ok, %HTTPoison.Response{
          status_code: 200,
          body: Jason.encode!(%{"subscription" => %{"id" => 123456789}})
        }}
      end)

      # Call the function with UTM params
      ConvertKit.subscribe_to_early_access(email, utm_params)
    end

    test "works in development mode without API key" do
      # Temporarily clear API key setting
      original_config = Application.get_env(:rsolv, :convertkit)
      config_without_key = Keyword.put(original_config, :api_key, nil)
      Application.put_env(:rsolv, :convertkit, config_without_key)

      # Set up a mock to ensure no HTTP requests are made
      # This prevents Mox.UnexpectedCallError
      Mox.stub(HTTPClientMock, :post, fn _url, _body, _headers, _options ->
        raise "This should not be called when API key is nil"
      end)

      # Call the function (should not make HTTP requests)
      result = ConvertKit.subscribe_to_early_access("test@example.com")

      # Assert the mock success response
      assert {:ok, response} = result
      assert response.status == "mocked_success"

      # Restore original config
      Application.put_env(:rsolv, :convertkit, original_config)
    end
  end

  describe "add_tag_to_subscriber/2" do
    test "successfully adds a tag to a subscriber", %{fixtures: fixtures, test_email: email, test_tag_id: tag_id} do
      # Mock the HTTP call to return success
      expect(HTTPClientMock, :post, fn _url, _body, _headers, _options ->
        {:ok, fixtures.tag_success}
      end)

      # Call the function
      result = ConvertKit.add_tag_to_subscriber(email, tag_id)

      # Assert on the result
      assert {:ok, response} = result
      assert response.status_code == 200
      assert response.message == "Tagged successfully"
    end

    test "queues tag when API call fails", %{fixtures: fixtures, test_email: email, test_tag_id: tag_id} do
      # Mock the HTTP call to fail twice (once for immediate attempt, once for queued job)
      expect(HTTPClientMock, :post, 2, fn _url, _body, _headers, _options ->
        fixtures.network_error
      end)

      # Call the function
      result = ConvertKit.add_tag_to_subscriber(email, tag_id)

      # Assert that we got a success result (since it queued the request)
      assert {:ok, response} = result
      assert response.status_code == 200
      assert response.message == "Tagging queued for later processing"

      # Verify the job was queued (it will be processed immediately in test mode)
      # The second mock call verifies the worker attempted to process it
    end

    test "works in development mode without API key", %{test_email: email, test_tag_id: tag_id} do
      # Temporarily clear API key setting
      original_config = Application.get_env(:rsolv, :convertkit)
      config_without_key = Keyword.put(original_config, :api_key, nil)
      Application.put_env(:rsolv, :convertkit, config_without_key)

      # Set up a mock to ensure no HTTP requests are made
      # This prevents Mox.UnexpectedCallError
      Mox.stub(HTTPClientMock, :post, fn _url, _body, _headers, _options ->
        raise "This should not be called when API key is nil"
      end)

      # Call the function (should not make HTTP requests)
      result = ConvertKit.add_tag_to_subscriber(email, tag_id)

      # Assert the mock success response
      assert {:ok, response} = result
      assert response.status == "mocked_success"

      # Restore original config
      Application.put_env(:rsolv, :convertkit, original_config)
    end
  end

  describe "unsubscribe/1" do
    test "successfully unsubscribes a user", %{fixtures: fixtures, test_email: email} do
      # Mock the HTTP calls to return success for subscriber lookup and unsubscribe
      expect(HTTPClientMock, :get, fn _url, _headers, _options ->
        {:ok, fixtures.subscriber_lookup_success}
      end)

      expect(HTTPClientMock, :post, fn _url, _body, _headers, _options ->
        {:ok, fixtures.unsubscribe_success}
      end)

      # Call the function
      result = ConvertKit.unsubscribe(email)

      # Assert on the result
      assert {:ok, response} = result
      assert response.status_code == 200
      assert response.message == "Unsubscribed successfully"
    end

    test "handles case when subscriber is not found", %{fixtures: fixtures, test_email: email} do
      # Mock the HTTP call to return empty subscribers list
      expect(HTTPClientMock, :get, fn _url, _headers, _options ->
        {:ok, fixtures.subscriber_lookup_empty}
      end)

      # Call the function
      result = ConvertKit.unsubscribe(email)

      # Assert that we got a success result (since the email wasn't subscribed)
      assert {:ok, response} = result
      assert response.status_code == 200
      assert response.message == "Subscriber not found"
    end

    test "creates fallback record when unsubscribe fails", %{fixtures: fixtures, test_email: email} do
      # Mock the HTTP calls - subscriber lookup success but unsubscribe fails
      expect(HTTPClientMock, :get, fn _url, _headers, _options ->
        {:ok, fixtures.subscriber_lookup_success}
      end)

      expect(HTTPClientMock, :post, fn _url, _body, _headers, _options ->
        fixtures.network_error
      end)

      # Call the function
      result = ConvertKit.unsubscribe(email)

      # Assert on the result
      assert {:error, error} = result
      assert error.message == "Unsubscribe failed, but recorded for retry"
      assert error.email == email

      # Check that the email was added to the database
      assert Rsolv.EmailManagement.get_unsubscribe_by_email(email) != nil
    end

    test "handles lookup failure", %{fixtures: fixtures, test_email: email} do
      # Mock the HTTP call to fail on subscriber lookup
      expect(HTTPClientMock, :get, fn _url, _headers, _options ->
        fixtures.network_error
      end)

      # Call the function
      result = ConvertKit.unsubscribe(email)

      # Assert that we got a success result (fails safe)
      assert {:ok, response} = result
      assert response.status_code == 200
      assert response.message == "Subscriber not found"
    end

    test "works in development mode without API key", %{test_email: email} do
      # Temporarily clear API key setting
      original_config = Application.get_env(:rsolv, :convertkit)
      config_without_key = Keyword.put(original_config, :api_key, nil)
      Application.put_env(:rsolv, :convertkit, config_without_key)

      # Set up a mock to ensure no HTTP requests are made
      # This prevents Mox.UnexpectedCallError
      Mox.stub(HTTPClientMock, :get, fn _url, _headers, _options ->
        raise "This should not be called when API key is nil"
      end)

      Mox.stub(HTTPClientMock, :post, fn _url, _body, _headers, _options ->
        raise "This should not be called when API key is nil"
      end)

      # Call the function (should not make HTTP requests)
      result = ConvertKit.unsubscribe(email)

      # Assert the mock success response
      assert {:ok, response} = result
      assert response.status == "mocked_success"

      # Restore original config
      Application.put_env(:rsolv, :convertkit, original_config)
    end
  end
end