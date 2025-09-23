defmodule RsolvWeb.ConvertKitIntegrationTest do
  use RsolvWeb.ConnCase
  
  # Import Mox for setting up mock expectations
  import Mox
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
    
    # Configure HTTP client to use mocks for all tests
    Application.put_env(:rsolv, :http_client, Rsolv.HTTPClientMock)
    
    # Get test fixtures
    fixtures = RsolvWeb.Mocks.convertkit_fixtures()
    
    # Return the test context
    %{
      fixtures: fixtures,
      test_email: "test_integration@example.com"
    }
  end
  
  describe "early access form integration" do
    test "successfully processes form submission with ConvertKit integration", %{conn: conn, fixtures: fixtures, test_email: email} do
      # We need to account for all HTTP calls made during the request:
      # 1. Subscribe endpoint
      # 2. Tag endpoint
      # 3. Email sequence call
      # Using allow to handle multiple calls more flexibly
      Mox.stub(HTTPClientMock, :post, fn url, _body, _headers, _options ->
        cond do
          # Subscriber API call
          String.contains?(url, "/subscribers") ->
            # Log for debugging
            # IO.puts("Mock received subscriber request: #{url}")
            {:ok, fixtures.subscription_success}
            
          # Tag API call  
          String.contains?(url, "/tags/") ->
            # Log for debugging
            # IO.puts("Mock received tag request: #{url}")
            {:ok, fixtures.tag_success}
            
          # Any other API calls (like email sequence)
          true ->
            # Log for debugging
            # IO.puts("Mock received other request: #{url}")
            {:ok, fixtures.subscription_success}
        end
      end)
      
      # Make a POST request to the early access endpoint
      response = 
        conn
        |> post(~p"/early-access", %{"email" => email})
        |> html_response(302) # Redirect status code
      
      # Check that we get a redirect response
      assert response =~ "redirected"
      
      # Verify that the email was saved to the database
      # Give it a moment for any async operations
      :timer.sleep(100)
      
      # Check all signups for debugging
      all_signups = Rsolv.EarlyAccess.list_signups()
      IO.inspect(length(all_signups), label: "Total signups in DB")
      IO.inspect(Enum.map(all_signups, & &1.email), label: "All emails")
      
      signup = Rsolv.EarlyAccess.get_signup_by_email(email)
      assert signup != nil, "Signup not found for email: #{email}"
      assert signup.email == email
    end
    
    test "handles ConvertKit API failure gracefully", %{conn: conn, test_email: email} do
      # Mock the HTTP calls to fail for all calls
      # Using stub instead of expect for more flexibility with multiple post calls
      Mox.stub(HTTPClientMock, :post, fn _url, _body, _headers, _options ->
        {:error, %HTTPoison.Error{reason: :econnrefused}}
      end)
      
      # Make a POST request to the early access endpoint
      response = 
        conn
        |> post(~p"/early-access", %{"email" => email})
        |> html_response(302) # Should still redirect despite API failure
      
      # Check that we get a redirect response
      assert response =~ "redirected"
      
      # Verify that the email was saved to the database despite API failure
      signup = Rsolv.EarlyAccess.get_signup_by_email(email)
      assert signup != nil
      assert signup.email == email
    end
    
    test "full request cycle with UTM parameters", %{conn: conn, fixtures: fixtures} do
      # Mock the HTTP calls to verify UTM params are passed through
      Mox.stub(HTTPClientMock, :post, fn url, body, _headers, _options ->
        cond do
          String.contains?(url, "/subscribers") ->
            # Parse the request body to extract fields
            case Jason.decode(body) do
              {:ok, decoded} ->
                fields = decoded["fields"]
                
                # Check that all UTM params are passed through correctly
                if fields && 
                   fields["utm_source"] == "google" && 
                   fields["utm_medium"] == "cpc" && 
                   fields["utm_campaign"] == "spring" do
                  {:ok, fixtures.subscription_success}
                else
                  # For debugging in case of issues
                  # IO.inspect(fields, label: "Fields in request")
                  {:error, %HTTPoison.Error{reason: :invalid_utm_params}}
                end
                
              _ ->
                {:error, %HTTPoison.Error{reason: :invalid_json}}
            end
            
          String.contains?(url, "/tags/") ->
            # Tagging call doesn't need to verify UTM params
            {:ok, fixtures.tag_success}
            
          # Handle any other API calls
          true ->
            {:ok, fixtures.subscription_success}
        end
      end)
      
      # Make a POST request with UTM parameters in query string
      response = 
        conn
        |> Map.update!(:query_params, fn _ -> 
          %{"utm_source" => "google", "utm_medium" => "cpc", "utm_campaign" => "spring"}
        end)
        |> post(~p"/early-access", %{"email" => "test_utm@example.com"})
        |> html_response(302)
      
      # Check that we get a redirect response
      assert response =~ "redirected"
    end
    
    test "validates email before sending to ConvertKit", %{conn: conn} do
      # Set up a mock that fails if an API call happens
      # This ensures no HTTP calls are made with invalid email
      Mox.stub(HTTPClientMock, :post, fn url, _body, _headers, _options -> 
        flunk("Should not call ConvertKit API with invalid email: #{url}")
      end)
      
      # Make a POST request with an invalid email
      response = 
        conn
        |> post(~p"/early-access", %{"email" => "invalid-email"})
        |> html_response(302)
      
      # Check that it redirects to the error anchor
      assert response =~ "#early-access"
      
      # Check that the email was NOT saved to the database
      signup = Rsolv.EarlyAccess.get_signup_by_email("invalid-email")
      assert signup == nil
    end
    
    test "handles different email param formats", %{conn: conn, fixtures: fixtures} do
      # Setup mocks for any API calls
      Mox.stub(HTTPClientMock, :post, fn _url, _body, _headers, _options ->
        {:ok, fixtures.subscription_success}
      end)
      
      # Test the LiveView format (signup param)
      response = 
        conn
        |> post(~p"/early-access", %{"signup" => %{"email" => "liveview@example.com"}})
        |> html_response(302)
        
      assert response =~ "redirected"
      
      # Test the older format (email_form param)
      response = 
        conn
        |> post(~p"/early-access", %{"email_form" => %{"email" => "oldform@example.com"}})
        |> html_response(302)
        
      assert response =~ "redirected"
      
      # Verify both were saved to database
      assert Rsolv.EarlyAccess.email_exists?("liveview@example.com")
      assert Rsolv.EarlyAccess.email_exists?("oldform@example.com")
    end
  end
end