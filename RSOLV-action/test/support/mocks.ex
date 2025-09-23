defmodule RsolvLandingWeb.Mocks do
  @moduledoc """
  Mocks for external services like ConvertKit API.
  """
  
  # Define mocks for external services
  Mox.defmock(RsolvLandingWeb.HTTPoisonMock, for: HTTPoison.Base)
  Mox.defmock(RsolvLanding.HTTPClientMock, for: HTTPoison.Base)
  
  # Define test data
  def convertkit_fixtures do
    %{
      # Successful subscription response
      subscription_success: %HTTPoison.Response{
        status_code: 200,
        body: Jason.encode!(%{
          "subscription" => %{
            "id" => 123456789,
            "state" => "active",
            "source" => "API",
            "created_at" => "2023-05-01T12:00:00Z",
            "subscriber" => %{
              "id" => 987654321,
              "email_address" => "test@example.com"
            }
          }
        })
      },

      # Failed subscription response (already subscribed)
      subscription_already_exists: %HTTPoison.Response{
        status_code: 200,
        body: Jason.encode!(%{
          "subscription" => %{
            "id" => 123456789,
            "state" => "active",
            "source" => "API"
          }
        })
      },

      # Failed subscription response (invalid form)
      subscription_form_not_found: %HTTPoison.Response{
        status_code: 404,
        body: Jason.encode!(%{
          "error" => "Form not found"
        })
      },

      # Failed subscription response (invalid API key)
      subscription_unauthorized: %HTTPoison.Response{
        status_code: 401,
        body: Jason.encode!(%{
          "error" => "Unauthorized"
        })
      },

      # Successful tag response
      tag_success: %HTTPoison.Response{
        status_code: 200,
        body: Jason.encode!(%{
          "subscription" => %{
            "id" => 123456789,
            "subscriber" => %{
              "id" => 987654321,
              "email_address" => "test@example.com"
            }
          }
        })
      },

      # Failed tag response (tag not found)
      tag_not_found: %HTTPoison.Response{
        status_code: 404,
        body: Jason.encode!(%{
          "error" => "Tag not found"
        })
      },

      # Subscriber lookup response
      subscriber_lookup_success: %HTTPoison.Response{
        status_code: 200,
        body: Jason.encode!(%{
          "subscribers" => [
            %{
              "id" => 987654321,
              "email_address" => "test@example.com",
              "state" => "active",
              "created_at" => "2023-05-01T12:00:00Z"
            }
          ]
        })
      },

      # Empty subscriber lookup response
      subscriber_lookup_empty: %HTTPoison.Response{
        status_code: 200,
        body: Jason.encode!(%{
          "subscribers" => []
        })
      },

      # Successful unsubscribe response
      unsubscribe_success: %HTTPoison.Response{
        status_code: 200,
        body: Jason.encode!(%{
          "subscriber" => %{
            "id" => 987654321,
            "state" => "cancelled"
          }
        })
      },

      # Network error
      network_error: {:error, %HTTPoison.Error{reason: :econnrefused}}
    }
  end
  
  # Helper for setting up mocks in tests
  def setup_convertkit_mocks do
    fixtures = convertkit_fixtures()
    
    # Setup successful subscription and tag API calls
    Mox.stub(RsolvLandingWeb.HTTPoisonMock, :post, fn url, _body, _headers, _options ->
      cond do
        String.contains?(url, "/subscribers") ->
          {:ok, fixtures.subscription_success}
          
        String.contains?(url, "/forms/") && String.contains?(url, "/subscribe") ->
          {:ok, fixtures.subscription_success}
          
        String.contains?(url, "/tags/") && String.contains?(url, "/subscribe") ->
          {:ok, fixtures.tag_success}
          
        true ->
          {:ok, %HTTPoison.Response{status_code: 404, body: "Not found"}}
      end
    end)
  end
  
  # Helper to setup Bypass for ConvertKit API testing
  def setup_bypass_for_convertkit do
    # Start Bypass
    bypass = Bypass.open()
    
    # Configure the application to use our bypass server
    Application.put_env(:rsolv_landing, :convertkit, [
      api_key: "test_api_key",
      form_id: "test_form_id", 
      early_access_tag_id: "test_tag_id",
      api_base_url: "http://localhost:#{bypass.port}/v3"
    ])
    
    # Return the bypass instance
    bypass
  end
  
  # Functions to set up specific Bypass endpoints
  
  # Setup endpoint for successful subscription
  def setup_bypass_subscription_success(bypass) do
    Bypass.expect(bypass, "POST", "/v3/subscribers", fn conn ->
      conn
      |> Plug.Conn.put_resp_content_type("application/json")
      |> Plug.Conn.resp(200, Jason.encode!(%{
        "subscription" => %{
          "id" => 123456789,
          "state" => "active",
          "source" => "API",
          "created_at" => "2023-05-01T12:00:00Z",
          "subscriber" => %{
            "id" => 987654321,
            "email_address" => "test@example.com"
          }
        }
      }))
    end)
  end
  
  # Setup endpoint for successful tagging
  def setup_bypass_tag_success(bypass, tag_id \\ "test_tag_id") do
    Bypass.expect(bypass, "POST", "/v3/tags/#{tag_id}/subscribe", fn conn ->
      conn
      |> Plug.Conn.put_resp_content_type("application/json")
      |> Plug.Conn.resp(200, Jason.encode!(%{
        "subscription" => %{
          "id" => 123456789,
          "subscriber" => %{
            "id" => 987654321,
            "email_address" => "test@example.com"
          }
        }
      }))
    end)
  end
  
  # Setup endpoint for subscription error
  def setup_bypass_subscription_error(bypass, status_code \\ 401) do
    Bypass.expect(bypass, "POST", "/v3/subscribers", fn conn ->
      conn
      |> Plug.Conn.put_resp_content_type("application/json")
      |> Plug.Conn.resp(status_code, Jason.encode!(%{
        "error" => "Unauthorized"
      }))
    end)
  end
  
  # Setup endpoint for tag error
  def setup_bypass_tag_error(bypass, tag_id \\ "test_tag_id", status_code \\ 404) do
    Bypass.expect(bypass, "POST", "/v3/tags/#{tag_id}/subscribe", fn conn ->
      conn
      |> Plug.Conn.put_resp_content_type("application/json")
      |> Plug.Conn.resp(status_code, Jason.encode!(%{
        "error" => "Tag not found"
      }))
    end)
  end
end