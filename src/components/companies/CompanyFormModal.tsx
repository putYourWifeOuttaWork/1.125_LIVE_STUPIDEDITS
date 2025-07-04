import { useFormik } from 'formik';
import * as Yup from 'yup';
import Button from '../common/Button';
import Input from '../common/Input';
import Modal from '../common/Modal';
import { Company } from '../../hooks/useCompanies';

interface CompanyFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Company>) => Promise<Company | null>;
  initialData?: Company;
}

const CompanySchema = Yup.object().shape({
  name: Yup.string()
    .required('Company name is required')
    .min(2, 'Company name must be at least 2 characters')
    .max(100, 'Company name must be at most 100 characters'),
  description: Yup.string()
    .max(500, 'Description must be at most 500 characters'),
  website: Yup.string()
    .url('Website must be a valid URL')
    .max(255, 'Website must be at most 255 characters'),
});

const CompanyFormModal = ({ 
  isOpen, 
  onClose, 
  onSubmit, 
  initialData 
}: CompanyFormModalProps) => {
  const formik = useFormik({
    initialValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      website: initialData?.website || '',
    },
    validationSchema: CompanySchema,
    onSubmit: async (values, { setSubmitting }) => {
      try {
        const result = await onSubmit(values);
        if (result) {
          onClose();
        }
      } finally {
        setSubmitting(false);
      }
    },
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Company' : 'New Company'}
    >
      <form onSubmit={formik.handleSubmit} className="p-4">
        <Input
          label="Company Name"
          id="name"
          name="name"
          placeholder="Enter company name"
          value={formik.values.name}
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
          error={formik.touched.name && formik.errors.name ? formik.errors.name : undefined}
          autoFocus
        />
        
        <div className="mb-4">
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Enter company description (optional)"
            value={formik.values.description}
            onChange={formik.handleChange}
            onBlur={formik.handleBlur}
          ></textarea>
          {formik.touched.description && formik.errors.description && (
            <p className="mt-1 text-sm text-error-600">{formik.errors.description}</p>
          )}
        </div>
        
        <Input
          label="Website"
          id="website"
          name="website"
          placeholder="https://example.com (optional)"
          value={formik.values.website}
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
          error={formik.touched.website && formik.errors.website ? formik.errors.website : undefined}
        />
        
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <Button 
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button 
            type="submit"
            variant="primary"
            isLoading={formik.isSubmitting}
            disabled={!(formik.isValid && formik.dirty)}
          >
            {initialData ? 'Save Changes' : 'Create Company'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CompanyFormModal;