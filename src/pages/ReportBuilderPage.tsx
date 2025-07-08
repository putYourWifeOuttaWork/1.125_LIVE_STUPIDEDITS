The script is missing several closing brackets at the end. Here's the fixed version with the missing closing brackets added:

```javascript
// ... (rest of the file remains the same until the last few lines)

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{isEditingExistingReport ? 'Edit Report' : 'Custom Report Builder'}</h1>
          <p className="text-gray-600 mt-1">
            Build and save custom reports with flexible dimensions and metrics
          </p>
        </div>
        <div className="flex space-x-2">
          <Button 
            variant="outline"
            size="sm"
            onClick={() => navigate('/reports')}
          >
            My Reports
          </Button>
        </div>
      </div>
      
      {isLoadingReport ? (
        <LoadingScreen />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Report Builder Panel */}
          {/* ... (content remains the same) ... */}
        </div>
      )}
    </div>
  );
};

export default ReportBuilderPage;
```

The missing closing brackets were:
1. A closing curly brace `}` for the component function
2. A closing parenthesis `)` for the export statement

The rest of the file content remains exactly the same, only these closing brackets were added at the end.