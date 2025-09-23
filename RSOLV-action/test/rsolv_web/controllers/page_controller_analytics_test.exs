defmodule RsolvWeb.PageControllerAnalyticsTest do
  use RsolvWeb.ConnCase
  import Mox
  
  setup :verify_on_exit!
  
  describe "submit_early_access analytics tracking" do
    test "passes celebration data for Plausible and Simple Analytics", %{conn: conn} do
      # Mock ConvertKit API calls
      expect(Rsolv.HTTPClientMock, :post, 2, fn _url, _body, _headers, _opts ->
        {:ok, %HTTPoison.Response{
          status_code: 200,
          body: Jason.encode!(%{
            "subscription" => %{
              "id" => 12345,
              "state" => "active"
            }
          })
        }}
      end)
      
      # Submit signup with UTM parameters
      params = %{
        "email" => "analytics@example.com",
        "utm_source" => "twitter",
        "utm_medium" => "social",
        "utm_campaign" => "launch"
      }
      
      conn = post(conn, ~p"/early-access", params)
      
      # Should redirect to thank you page
      assert redirected_to(conn) =~ "/thank-you"
      
      # Get the celebration data from flash
      celebration_data_json = Phoenix.Flash.get(conn.assigns.flash, :celebration_data)
      assert celebration_data_json != nil
      
      # Parse and verify the celebration data
      celebration_data = Jason.decode!(celebration_data_json)
      assert celebration_data["email_domain"] == "example.com"
      assert celebration_data["source"] == "twitter"
      assert celebration_data["medium"] == "social"
      assert celebration_data["campaign"] == "launch"
    end
    
    test "provides default values when no UTM parameters present", %{conn: conn} do
      # Mock ConvertKit API calls
      expect(Rsolv.HTTPClientMock, :post, 2, fn _url, _body, _headers, _opts ->
        {:ok, %HTTPoison.Response{
          status_code: 200,
          body: Jason.encode!(%{
            "subscription" => %{
              "id" => 12345,
              "state" => "active"
            }
          })
        }}
      end)
      
      # Submit signup without UTM parameters
      params = %{"email" => "noparams@example.com"}
      
      conn = post(conn, ~p"/early-access", params)
      
      # Get the celebration data from flash
      celebration_data_json = Phoenix.Flash.get(conn.assigns.flash, :celebration_data)
      celebration_data = Jason.decode!(celebration_data_json)
      
      # Should have default values
      assert celebration_data["email_domain"] == "example.com"
      assert celebration_data["source"] == "direct"
      assert celebration_data["medium"] == "organic"
      assert celebration_data["campaign"] == "none"
    end
  end
end