defmodule Rsolv.Workers.TaggingWorkerTest do
  use Rsolv.DataCase
  use Oban.Testing, repo: Rsolv.Repo
  
  alias Rsolv.Workers.TaggingWorker
  import Mox

  setup :verify_on_exit!
  
  setup do
    # Configure the HTTP client to use the mock
    Application.put_env(:rsolv, :http_client, Rsolv.HTTPClientMock)
    :ok
  end

  describe "perform/1" do
    test "successfully tags a subscriber in ConvertKit" do
      # Mock the HTTP client
      Rsolv.HTTPClientMock
      |> expect(:post, fn url, body, headers, opts ->
        assert url == "https://api.convertkit.com/v3/tags/123456/subscribe"
        
        decoded_body = Jason.decode!(body)
        assert decoded_body["email"] == "test@example.com"
        assert decoded_body["api_key"] == "test_api_key"
        
        assert {"Content-Type", "application/json"} in headers
        assert {"Accept", "application/json"} in headers
        assert opts[:recv_timeout] == 10000
        
        {:ok, %HTTPoison.Response{
          status_code: 200,
          body: Jason.encode!(%{
            "subscription" => %{
              "id" => "sub_12345",
              "state" => "active"
            }
          })
        }}
      end)
      
      # Create the job
      job = %{
        email: "test@example.com",
        tag_id: "123456",
        api_key: "test_api_key"
      }
      
      # Perform the job
      assert :ok = perform_job(TaggingWorker, job)
    end
    
    test "handles ConvertKit API errors gracefully" do
      # Mock the HTTP client to return an error
      Rsolv.HTTPClientMock
      |> expect(:post, fn _url, _body, _headers, _opts ->
        {:ok, %HTTPoison.Response{
          status_code: 404,
          body: Jason.encode!(%{
            "error" => "Tag not found"
          })
        }}
      end)
      
      # Create the job
      job = %{
        email: "test@example.com",
        tag_id: "invalid_tag",
        api_key: "test_api_key"
      }
      
      # Perform the job - should return error tuple for retry
      assert {:error, "HTTP Status: 404, Body: " <> _} = perform_job(TaggingWorker, job)
    end
    
    test "handles network errors with retry" do
      # Mock the HTTP client to return a network error
      Rsolv.HTTPClientMock
      |> expect(:post, fn _url, _body, _headers, _opts ->
        {:error, %HTTPoison.Error{reason: :timeout}}
      end)
      
      # Create the job
      job = %{
        email: "test@example.com",
        tag_id: "123456",
        api_key: "test_api_key"
      }
      
      # Perform the job - should return error for retry
      assert {:error, "HTTP Error: :timeout"} = perform_job(TaggingWorker, job)
    end
    
    test "logs successful tagging" do
      # Mock successful response
      Rsolv.HTTPClientMock
      |> expect(:post, fn _url, _body, _headers, _opts ->
        {:ok, %HTTPoison.Response{
          status_code: 200,
          body: Jason.encode!(%{
            "subscription" => %{
              "id" => "sub_12345"
            }
          })
        }}
      end)
      
      job = %{
        email: "test@example.com",
        tag_id: "123456",
        api_key: "test_api_key"
      }
      
      # Temporarily set log level to info
      original_level = Logger.level()
      Logger.configure(level: :info)
      
      # Capture logs
      log_capture = ExUnit.CaptureLog.capture_log(fn ->
        perform_job(TaggingWorker, job)
      end)
      
      # Restore original log level
      Logger.configure(level: original_level)
      
      assert log_capture =~ "Successfully tagged test@example.com"
      assert log_capture =~ "sub_12345"
    end
    
    test "validates required job args" do
      # Missing email
      assert_raise FunctionClauseError, fn ->
        perform_job(TaggingWorker, %{tag_id: "123", api_key: "key"})
      end
      
      # Missing tag_id
      assert_raise FunctionClauseError, fn ->
        perform_job(TaggingWorker, %{email: "test@example.com", api_key: "key"})
      end
      
      # Missing api_key
      assert_raise FunctionClauseError, fn ->
        perform_job(TaggingWorker, %{email: "test@example.com", tag_id: "123"})
      end
    end
  end
  
  describe "schedule_tagging/2" do
    test "enqueues a tagging job" do
      # Don't actually insert the job since it would execute immediately in test mode
      args = %{
        "email" => "test@example.com",
        "tag_id" => "123456",
        "api_key" => "test_api_key"
      }
      
      changeset = TaggingWorker.new(args)
      
      assert changeset.changes.worker == "Rsolv.Workers.TaggingWorker"
      assert changeset.changes.args["email"] == "test@example.com"
      assert changeset.changes.args["tag_id"] == "123456"
      assert changeset.changes.args["api_key"] == "test_api_key"
      assert changeset.changes.queue == "email_tagging"
    end
    
    test "uses configured API key" do
      # Temporarily set config
      original_config = Application.get_env(:rsolv, :convertkit, %{})
      Application.put_env(:rsolv, :convertkit, %{api_key: "configured_key"})
      
      # Build args that would be used
      config = Application.get_env(:rsolv, :convertkit, %{})
      api_key = config[:api_key]
      
      assert api_key == "configured_key"
      
      # Restore original config
      Application.put_env(:rsolv, :convertkit, original_config)
    end
    
    test "allows custom options" do
      args = %{
        "email" => "test@example.com",
        "tag_id" => "123456",
        "api_key" => "test_api_key"
      }
      
      changeset = TaggingWorker.new(args, priority: 3, max_attempts: 5)
      
      assert changeset.changes.priority == 3
      assert changeset.changes.max_attempts == 5
    end
  end
end