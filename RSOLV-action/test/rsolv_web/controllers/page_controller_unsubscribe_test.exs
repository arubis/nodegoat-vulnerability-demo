defmodule RsolvWeb.PageControllerUnsubscribeTest do
  use RsolvWeb.ConnCase
  import Phoenix.ConnTest
  import Mox

  # Make sure mocks are verified when the test exits
  setup :verify_on_exit!

  setup do
    # Set up HTTP client mock for tests
    Application.put_env(:rsolv, :http_client, RsolvWeb.HTTPoisonMock)

    # Get fixtures
    fixtures = RsolvWeb.Mocks.convertkit_fixtures()

    # Return fixtures for use in tests
    %{fixtures: fixtures}
  end

  describe "unsubscribe page" do
    test "GET /unsubscribe renders the unsubscribe page", %{conn: conn} do
      conn = get(conn, ~p"/unsubscribe")
      assert html_response(conn, 200) =~ "Unsubscribe from Emails"
    end

    test "GET /unsubscribe with email param shows the email", %{conn: conn} do
      email = "test@example.com"
      conn = get(conn, ~p"/unsubscribe?email=#{email}")
      assert html_response(conn, 200) =~ email
    end

    test "POST /unsubscribe processes the unsubscribe request", %{conn: conn, fixtures: fixtures} do
      email = "test@example.com"

      # Mock the HTTP calls for ConvertKit API
      # First mock the subscriber lookup
      expect(RsolvWeb.HTTPoisonMock, :get, fn _url, _headers, _options ->
        {:ok, fixtures.subscriber_lookup_success}
      end)

      # Then mock the unsubscribe request
      expect(RsolvWeb.HTTPoisonMock, :post, fn _url, _body, _headers, _options ->
        {:ok, fixtures.unsubscribe_success}
      end)

      conn = post(conn, ~p"/unsubscribe", %{"email" => email})

      assert html_response(conn, 200) =~ "successfully unsubscribed"
      assert html_response(conn, 200) =~ email
    end

    test "POST /unsubscribe with invalid email shows an error", %{conn: conn} do
      conn = post(conn, ~p"/unsubscribe", %{"email" => ""})

      assert html_response(conn, 200) =~ "valid email address"
    end
  end
end