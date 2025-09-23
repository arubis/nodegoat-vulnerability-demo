defmodule RsolvWeb.PageControllerTest.Unit do
  use RsolvWeb.ConnCase, async: true
  import Mox
  
  setup :verify_on_exit!
  
  setup do
    # Configure the HTTP client to use the mock
    Application.put_env(:rsolv, :http_client, Rsolv.HTTPClientMock)
    :ok
  end
  
  # Test email validation indirectly through controller action
  test "email validation accepts valid email formats", %{conn: conn} do
    # Valid test emails
    valid_emails = [
      "user@example.com",
      "user.name@example.com",
      "user-name@example.com",
      "user+tag@example.com",
      "user+support+tickets@example.com",
      "user@example.co.uk",
      "user@sub.domain.example.com"
    ]
    
    # Mock the success call so we don't actually hit ConvertKit
    Mox.stub(Rsolv.HTTPClientMock, :post, fn _url, _body, _headers, _options ->
      {:ok, %HTTPoison.Response{status_code: 200, body: "{\"subscription\":{\"id\":123456}}"}}
    end)
    
    # Test each valid email - they should all redirect to home page (success)
    Enum.each(valid_emails, fn email ->
      response = 
        conn
        |> post(~p"/early-access", %{"email" => email})
        
      # Check for 302 redirect status (success) rather than a 400 (validation error)
      assert response.status == 302
    end)
  end
  
  test "email validation rejects invalid email formats", %{conn: conn} do
    # Invalid test emails
    invalid_emails = [
      "",
      "user",
      "user@",
      "@example.com",
      "user@example",
      "user@.com",
      "user @example.com",
      "user@ example.com"
    ]
    
    # Test each invalid email - they should all produce an error
    Enum.each(invalid_emails, fn email ->
      response =
        conn
        |> post(~p"/early-access", %{"email" => email})
        |> html_response(302)  # Still redirects, but to error path
        
      # Should redirect to the early-access section with error message
      assert response =~ "#early-access"
    end)
  end
end