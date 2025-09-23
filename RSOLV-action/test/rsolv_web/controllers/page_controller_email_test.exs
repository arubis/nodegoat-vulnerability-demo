defmodule RsolvWeb.PageControllerEmailTest do
  use RsolvWeb.ConnCase, async: false
  
  import Mox
  
  # Set up mocks to verify in tests
  setup :verify_on_exit!
  
  describe "early access form submission" do
    setup do
      # Set up the correct HTTP client mock
      Application.put_env(:rsolv, :http_client, Rsolv.HTTPClientMock)
      
      :ok
    end
    
    test "successful submission redirects to thank-you page", %{conn: conn} do
      # Mock ConvertKit API responses using the correct mock
      Rsolv.HTTPClientMock
      |> expect(:post, 2, fn _url, _body, _headers, _options ->
        {:ok, %HTTPoison.Response{
          status_code: 201,
          body: ~s({"subscriber": {"id": 12345}})
        }}
      end)
      
      # Submit the form
      conn = post(conn, ~p"/early-access", %{
        "email" => "test@example.com"
      })
      
      # Verify redirection
      assert redirected_to(conn) == "/thank-you"
    end
    
    test "successful submission with user data redirects correctly", %{conn: conn} do
      # Mock ConvertKit API responses using the correct mock
      Rsolv.HTTPClientMock
      |> expect(:post, 2, fn _url, _body, _headers, _options ->
        {:ok, %HTTPoison.Response{
          status_code: 201,
          body: ~s({"subscriber": {"id": 12345}})
        }}
      end)
      
      # Submit with additional information
      conn = post(conn, ~p"/early-access", %{
        "email" => "tester@example.com",
        "signup" => %{"email" => "tester@example.com"}
      })
      
      assert redirected_to(conn) == "/thank-you"
    end
  end
end