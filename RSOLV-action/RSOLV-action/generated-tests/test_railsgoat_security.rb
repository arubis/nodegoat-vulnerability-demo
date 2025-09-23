require "minitest/autorun"
require "minitest/spec"
require_relative "./unknown"

describe Unknown do
  describe "SQL_INJECTION vulnerability tests" do
    it "must be vulnerable to sql_injection (RED)" do
      # RED: Demonstrate vulnerability exists
      malicious_input = "'; DROP TABLE users; --"
      result = Unknown.new.process(malicious_input)
      _(result).wont_include "Permission denied"
      _(result).wont_include "syntax error"
    end

    it "must prevent sql_injection (GREEN)" do
      # GREEN: Verify fix prevents vulnerability
      malicious_input = "'; DROP TABLE users; --"
      _ { Unknown.new.process(malicious_input) }.must_raise SecurityError
    end

    it "must maintain functionality (REFACTOR)" do
      # REFACTOR: Ensure functionality is maintained
      valid_input = "validpassword123"
      result = Unknown.new.process(valid_input)
      _(result).must_be_kind_of String
      _(result).wont_be_empty
    end
  end
end